import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { createBunWebSocket } from 'hono/bun'
import type { WSContext } from 'hono/ws'
import { execTicketParamSchema, interactiveExecClientMessageSchema, interactiveExecTicketRequestSchema } from '@containers/contracts/engine-control'
import { createInteractiveExecSessionGuard } from '../service/shared/create-interactive-exec-session-guard'
import type { InteractiveExecService } from '../service/domain/create-interactive-exec-service'
import { withErrorHandling } from '../lib/with-error-handling'

const { upgradeWebSocket } = createBunWebSocket()
const INTERACTIVE_EXEC_IDLE_TIMEOUT_MS = 5 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_DURATION_MS = 30 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES = 1_048_576
const INTERACTIVE_EXEC_MAX_PENDING_INPUT_BYTES = 65_536

type InteractiveExecRouteDependencies = {
    interactiveExecService: InteractiveExecService
    limits?: {
        idleTimeoutMs?: number
        maxBufferedOutputBytes?: number
        maxDurationMs?: number
        maxPendingInputBytes?: number
    }
}

type BufferedWebSocket = {
    getBufferedAmount: () => number
}

const hasBufferedAmount = (value: unknown): value is BufferedWebSocket =>
    typeof value === 'object' &&
    value !== null &&
    'getBufferedAmount' in value &&
    typeof (value as { getBufferedAmount?: unknown }).getBufferedAmount === 'function'

export const createInteractiveExecRoute = ({ interactiveExecService, limits = {} }: InteractiveExecRouteDependencies) => {
    const idleTimeoutMs = limits.idleTimeoutMs ?? INTERACTIVE_EXEC_IDLE_TIMEOUT_MS
    const maxBufferedOutputBytes = limits.maxBufferedOutputBytes ?? INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES
    const maxDurationMs = limits.maxDurationMs ?? INTERACTIVE_EXEC_MAX_DURATION_MS
    const maxPendingInputBytes = limits.maxPendingInputBytes ?? INTERACTIVE_EXEC_MAX_PENDING_INPUT_BYTES

    return new Hono()
        .post(
            '/v1/containers/:containerId/exec-tickets',
            describeRoute({
                tags: ['interactive-exec'],
                summary: 'interactive exec ticket 생성',
                responses: { 201: { description: 'ticket 생성' } },
            }),
            validator('json', interactiveExecTicketRequestSchema),
            withErrorHandling(async (context) =>
                context.json(interactiveExecService.createTicket(context.req.param('containerId'), context.req.valid('json' as never)), 201),
            ),
        )
        .get(
            '/ws/exec/:ticket',
            describeRoute({
                tags: ['interactive-exec'],
                summary: 'interactive exec 웹소켓 연결',
                responses: { 101: { description: '웹소켓 연결' } },
            }),
            validator('param', execTicketParamSchema),
            upgradeWebSocket((context) => {
                const record = interactiveExecService.consumeTicket((context.req.valid('param' as never) as { ticket: string }).ticket)
                let attachedSocket: Awaited<ReturnType<InteractiveExecService['attach']>>['socket'] | undefined
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
                                const message =
                                    error instanceof Error ? error.message.slice(0, 1_024) : 'Docker interactive exec를 시작할 수 없습니다.'
                                closeSession(websocket, message, 1011)
                            })
                    },
                }
            }),
        )
}
