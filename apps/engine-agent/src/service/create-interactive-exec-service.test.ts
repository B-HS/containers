import { describe, expect, test } from 'bun:test'
import { createInteractiveExecService } from './create-interactive-exec-service'

describe('Interactive exec ticket', () => {
    test('ticket은 짧게 만료되며 한 번만 사용할 수 있습니다', () => {
        let now = new Date('2026-08-01T00:00:00.000Z')
        const service = createInteractiveExecService({
            dockerEngineClient: {
                createInteractiveExec: async () => {
                    throw new Error('테스트에서 호출되지 않습니다.')
                },
                inspectInteractiveExec: async () => 0,
                resizeInteractiveExec: async () => undefined,
            },
            now: () => now,
        })
        const first = service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })

        expect(service.consumeTicket(first.ticket).containerId).toBe('container-id')
        expect(() => service.consumeTicket(first.ticket)).toThrow('EXEC_TICKET_INVALID')

        const expired = service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })
        now = new Date('2026-08-01T00:00:31.000Z')
        expect(() => service.consumeTicket(expired.ticket)).toThrow('EXEC_TICKET_INVALID')
    })

    test('동시 session을 열 개로 제한하고 release 후 다시 허용합니다', () => {
        const service = createInteractiveExecService({
            dockerEngineClient: {
                createInteractiveExec: async () => {
                    throw new Error('테스트에서 호출되지 않습니다.')
                },
                inspectInteractiveExec: async () => 0,
                resizeInteractiveExec: async () => undefined,
            },
            now: () => new Date('2026-08-01T00:00:00.000Z'),
        })
        const sessions = Array.from({ length: 10 }, () => {
            const ticket = service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })
            return service.consumeTicket(ticket.ticket)
        })
        const overflow = service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })

        expect(() => service.consumeTicket(overflow.ticket)).toThrow('EXEC_SESSION_LIMIT_REACHED')
        expect(service.releaseSession(sessions[0]?.sessionId ?? '')).toBe(true)

        const replacement = service.createTicket('container-id', { columns: 120, command: ['/bin/sh'], environment: [], rows: 30 })
        expect(service.consumeTicket(replacement.ticket).sessionId).toBeString()
    })

    test('exec 종료 상태가 반영될 때까지 inspect하고 exit code를 반환합니다', async () => {
        let inspectCount = 0
        const service = createInteractiveExecService({
            dockerEngineClient: {
                createInteractiveExec: async () => {
                    throw new Error('테스트에서 호출되지 않습니다.')
                },
                inspectInteractiveExec: async () => {
                    inspectCount += 1
                    return inspectCount < 2 ? -1 : 137
                },
                resizeInteractiveExec: async () => undefined,
            },
            now: () => new Date('2026-08-01T00:00:00.000Z'),
        })

        expect(await service.finish('exec-id')).toBe(137)
        expect(inspectCount).toBe(2)
    })
})
