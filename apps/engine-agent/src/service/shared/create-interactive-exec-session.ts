import type { WSContext } from 'hono/ws'
import { interactiveExecClientMessageSchema } from '@containers/contracts/engine-control'
import type { InteractiveExecService } from '../domain/create-interactive-exec-service'
import { createInteractiveExecSessionGuard } from './create-interactive-exec-session-guard'

type InteractiveExecSessionLimits = {
    idleTimeoutMs: number
    maxBufferedOutputBytes: number
    maxDurationMs: number
    maxPendingInputBytes: number
}

type InteractiveExecSessionDependencies = {
    interactiveExecService: InteractiveExecService
    ticket: string
    limits: InteractiveExecSessionLimits
}

type BufferedWebSocket = {
    getBufferedAmount: () => number
}

const hasBufferedAmount = (value: unknown): value is BufferedWebSocket =>
    typeof value === 'object' &&
    value !== null &&
    'getBufferedAmount' in value &&
    typeof (value as { getBufferedAmount?: unknown }).getBufferedAmount === 'function'

type AttachedSocket = Awaited<ReturnType<InteractiveExecService['attach']>>['socket']

export type InteractiveExecSessionHandlers = {
    onClose: () => void
    onMessage: (event: MessageEvent<unknown>, websocket: WSContext) => void
    onOpen: (event: Event, websocket: WSContext) => void
}

export const createInteractiveExecSession = ({
    interactiveExecService,
    ticket,
    limits,
}: InteractiveExecSessionDependencies): InteractiveExecSessionHandlers => {
    const record = interactiveExecService.consumeTicket(ticket)
    const { idleTimeoutMs, maxBufferedOutputBytes, maxDurationMs, maxPendingInputBytes } = limits

    let attachedSocket: AttachedSocket | undefined
    let execId: string | undefined
    let sessionGuard: ReturnType<typeof createInteractiveExecSessionGuard> | undefined
    let pendingInput = ''
    let pendingResize: { columns: number; rows: number } | undefined
    let closed = false
    let released = false
    const decoder = new TextDecoder()

    const releaseSession = () => {
        if (!released) {
            released = true
            interactiveExecService.releaseSession(record.sessionId)
        }
    }
    const closeSession = (websocket: WSContext, message: string, code: number) => {
        closed = true
        sessionGuard?.stop()
        attachedSocket?.destroy()
        websocket.send(JSON.stringify({ message, type: 'error' }))
        websocket.close(code, message.slice(0, 120))
        releaseSession()
    }

    return {
        onClose: () => {
            closed = true
            sessionGuard?.stop()
            attachedSocket?.destroy()
            releaseSession()
        },
        onMessage: (event, websocket) => {
            try {
                sessionGuard?.touch()
                const message = interactiveExecClientMessageSchema.parse(JSON.parse(String(event.data)))
                if (message.type === 'heartbeat') {
                    websocket.send(JSON.stringify({ type: 'pong' }))
                } else if (message.type === 'detach') {
                    closed = true
                    sessionGuard?.stop()
                    attachedSocket?.destroy()
                    websocket.close(1000, 'detached')
                    releaseSession()
                } else if (message.type === 'input') {
                    if (attachedSocket) {
                        attachedSocket.write(message.data)
                    } else {
                        pendingInput += message.data
                        if (Buffer.byteLength(pendingInput) > maxPendingInputBytes) {
                            closeSession(websocket, '터미널 대기 입력 한도를 초과했습니다.', 1009)
                        }
                    }
                } else if (execId) {
                    void interactiveExecService
                        .resize(execId, message.rows, message.columns)
                        .catch(() => websocket.send(JSON.stringify({ message: '터미널 크기를 변경할 수 없습니다.', type: 'error' })))
                } else {
                    pendingResize = { columns: message.columns, rows: message.rows }
                }
            } catch {
                websocket.send(JSON.stringify({ message: '터미널 메시지가 올바르지 않습니다.', type: 'error' }))
            }
        },
        onOpen: (_event, websocket) => {
            sessionGuard = createInteractiveExecSessionGuard({
                idleTimeoutMs,
                maxDurationMs,
                onIdleTimeout: () => closeSession(websocket, '터미널 idle 시간이 초과되었습니다.', 1008),
                onMaxDuration: () => closeSession(websocket, '터미널 최대 연결 시간이 초과되었습니다.', 1008),
            })
            sessionGuard.start()
            void interactiveExecService
                .attach(record.containerId, record.input)
                .then((attached) => {
                    if (closed) {
                        attached.socket.destroy()
                        return
                    }
                    attachedSocket = attached.socket
                    execId = attached.execId
                    attached.socket.on('data', (chunk: Uint8Array) => {
                        if (hasBufferedAmount(websocket.raw) && websocket.raw.getBufferedAmount() > maxBufferedOutputBytes) {
                            closeSession(websocket, '터미널 출력 소비 속도가 너무 느립니다.', 1013)
                            return
                        }
                        const data = decoder.decode(chunk, { stream: true })
                        if (data.length > 0) {
                            websocket.send(JSON.stringify({ data, type: 'output' }))
                        }
                    })
                    attached.socket.on('end', () => {
                        const data = decoder.decode()
                        if (data.length > 0) {
                            websocket.send(JSON.stringify({ data, type: 'output' }))
                        }
                        void interactiveExecService
                            .finish(attached.execId)
                            .catch(() => -1)
                            .then((exitCode) => {
                                websocket.send(JSON.stringify({ exitCode, type: 'exit' }))
                                websocket.close(1000, 'exec completed')
                            })
                    })
                    attached.socket.on('error', () => closeSession(websocket, 'Docker exec stream에 실패했습니다.', 1011))
                    if (pendingResize) {
                        void interactiveExecService
                            .resize(attached.execId, pendingResize.rows, pendingResize.columns)
                            .catch(() => websocket.send(JSON.stringify({ message: '터미널 크기를 변경할 수 없습니다.', type: 'error' })))
                    }
                    if (pendingInput.length > 0) {
                        attached.socket.write(pendingInput)
                        pendingInput = ''
                    }
                    attached.socket.resume()
                    websocket.send(JSON.stringify({ type: 'ready' }))
                })
                .catch((error: unknown) => {
                    if (closed) {
                        return
                    }
                    const message = error instanceof Error ? error.message.slice(0, 1_024) : 'Docker interactive exec를 시작할 수 없습니다.'
                    closeSession(websocket, message, 1011)
                })
        },
    }
}
