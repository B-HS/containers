import { describe, expect, test } from 'bun:test'
import type { WSContext } from 'hono/ws'
import { createInteractiveExecSession } from './create-interactive-exec-session'
import { createInteractiveExecService, MAX_ACTIVE_INTERACTIVE_EXEC_SESSIONS } from '../domain/create-interactive-exec-service'

type SocketHandlers = Map<'data' | 'end' | 'error', (chunk?: unknown) => void>

type FakeSocket = {
    handlers: SocketHandlers
    writes: string[]
    destroyed: boolean
    resumed: boolean
    on: (event: 'data' | 'end' | 'error', callback: (chunk?: unknown) => void) => void
    write: (data: string) => void
    destroy: () => void
    resume: () => void
    trigger: (event: 'data' | 'end' | 'error', chunk?: unknown) => void
}

type FakeWebSocket = {
    sent: string[]
    closed: Array<{ code?: number | undefined; reason?: string | undefined }>
    bufferedAmount: number
}

const createTestFixture = async (handshakeTimeoutMs?: number) => {
    const sockets: FakeSocket[] = []
    const service = createInteractiveExecService({
        dockerEngineClient: {
            createInteractiveExec: async () => {
                const handlers: SocketHandlers = new Map()
                const socket: FakeSocket = {
                    handlers,
                    writes: [],
                    destroyed: false,
                    resumed: false,
                    on: (event, callback) => {
                        handlers.set(event, callback)
                    },
                    write: (data) => {
                        socket.writes.push(data)
                    },
                    destroy: () => {
                        socket.destroyed = true
                    },
                    resume: () => {
                        socket.resumed = true
                    },
                    trigger: (event, chunk) => {
                        handlers.get(event)?.(chunk)
                    },
                }
                sockets.push(socket)
                return { execId: 'exec-1', socket: socket as never }
            },
            getContainers: async () => [],
            inspectInteractiveExec: async () => 0,
            resizeInteractiveExec: async () => undefined,
        },
        now: () => new Date('2026-08-01T00:00:00.000Z'),
    })
    const ticket = await service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })
    const session = createInteractiveExecSession({
        interactiveExecService: service,
        ticket: ticket.ticket,
        limits: {
            handshakeTimeoutMs: handshakeTimeoutMs ?? 30 * 1_000,
            idleTimeoutMs: 5 * 60 * 1_000,
            maxBufferedOutputBytes: 1_048_576,
            maxDurationMs: 30 * 60 * 1_000,
            maxPendingInputBytes: 65_536,
        },
    })
    return { service, sockets, session, ticket }
}

const createWebSocket = (): { context: WSContext; websocket: FakeWebSocket } => {
    const websocket: FakeWebSocket = { sent: [], closed: [], bufferedAmount: 0 }
    const context = {
        send: (data: string) => websocket.sent.push(data),
        close: (code?: number, reason?: string) => websocket.closed.push({ code, reason }),
        raw: {
            getBufferedAmount: () => websocket.bufferedAmount,
        },
    } as unknown as WSContext
    return { context, websocket }
}

describe('Interactive exec session', () => {
    test('연결이 열리지 않은 세션은 handshake 시간이 지나면 slot 을 반납합니다', async () => {
        const { service } = await createTestFixture(1)
        await Bun.sleep(10)

        const reopened = await service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })

        expect(() => service.consumeTicket(reopened.ticket)).not.toThrow()
    })

    test('열리지 않은 세션이 쌓여도 동시 상한을 막지 않습니다', async () => {
        const { service } = await createTestFixture(1)

        for (let attempt = 0; attempt < MAX_ACTIVE_INTERACTIVE_EXEC_SESSIONS + 2; attempt += 1) {
            const created = await service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })
            createInteractiveExecSession({
                interactiveExecService: service,
                ticket: created.ticket,
                limits: {
                    handshakeTimeoutMs: 1,
                    idleTimeoutMs: 1_000,
                    maxBufferedOutputBytes: 1_024,
                    maxDurationMs: 1_000,
                    maxPendingInputBytes: 1_024,
                },
            })
            await Bun.sleep(3)
        }

        const final = await service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })

        expect(() => service.consumeTicket(final.ticket)).not.toThrow()
    })

    test('onOpen은 attach 후 ready 메시지를 보냅니다', async () => {
        const { session, sockets } = await createTestFixture()
        const { context, websocket } = createWebSocket()

        session.onOpen(new Event('open'), context)
        await Bun.sleep(0)

        expect(sockets).toHaveLength(1)
        expect(sockets[0]?.resumed).toBe(true)
        expect(websocket.sent).toContain(JSON.stringify({ type: 'ready' }))
    })

    test('onMessage의 detach는 1000으로 닫습니다', async () => {
        const { session } = await createTestFixture()
        const { context, websocket } = createWebSocket()

        session.onMessage({ data: JSON.stringify({ type: 'detach' }) } as MessageEvent, context)

        expect(websocket.closed).toHaveLength(1)
        expect(websocket.closed[0]?.code).toBe(1000)
    })

    test('attach 전 input은 소켓에 flush됩니다', async () => {
        const { session, sockets } = await createTestFixture()
        const { context } = createWebSocket()

        session.onMessage({ data: JSON.stringify({ type: 'input', data: 'echo hi\n' }) } as MessageEvent, context)
        session.onOpen(new Event('open'), context)
        await Bun.sleep(0)

        const socket = sockets[0]
        expect(socket?.writes).toContain('echo hi\n')
    })

    test('출력 소비가 느리면 1013으로 닫습니다', async () => {
        const { session, sockets } = await createTestFixture()
        const { context, websocket } = createWebSocket()
        websocket.bufferedAmount = 2_000_000

        session.onOpen(new Event('open'), context)
        await Bun.sleep(0)

        const socket = sockets[0]
        socket?.trigger('data', new Uint8Array([104, 105]))

        expect(websocket.closed).toHaveLength(1)
        expect(websocket.closed[0]?.code).toBe(1013)
    })

    test('소켓 종료 시 finish 후 exit 메시지를 보냅니다', async () => {
        const { session, sockets } = await createTestFixture()
        const { context, websocket } = createWebSocket()

        session.onOpen(new Event('open'), context)
        await Bun.sleep(0)

        sockets[0]?.trigger('end')
        await Bun.sleep(0)

        expect(websocket.sent).toContain(JSON.stringify({ exitCode: 0, type: 'exit' }))
        expect(websocket.closed[0]?.code).toBe(1000)
    })

    test('잘못된 메시지는 error를 보냅니다', async () => {
        const { session } = await createTestFixture()
        const { context, websocket } = createWebSocket()

        session.onMessage({ data: 'not-json' } as MessageEvent, context)

        expect(websocket.sent).toContain(JSON.stringify({ message: '터미널 메시지가 올바르지 않습니다.', type: 'error' }))
    })
})
