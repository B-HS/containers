import { describe, expect, test } from 'bun:test'
import { createServerDrain, createShutdownHandler, registerShutdownSignals } from './create-shutdown-handler'

describe('createShutdownHandler', () => {
    test('등록 순서대로 실행합니다', async () => {
        const order: string[] = []
        const shutdown = createShutdownHandler({
            steps: [
                { name: 'first', run: () => order.push('first') },
                { name: 'second', run: async () => void order.push('second') },
            ],
        })

        await shutdown()

        expect(order).toEqual(['first', 'second'])
    })

    test('한 단계가 실패해도 나머지를 실행하고 로그를 남깁니다', async () => {
        const logs: string[] = []
        const order: string[] = []
        const shutdown = createShutdownHandler({
            log: (line) => logs.push(line),
            steps: [
                {
                    name: 'broken',
                    run: () => {
                        throw new Error('닫기 실패')
                    },
                },
                { name: 'after', run: () => order.push('after') },
            ],
        })

        await shutdown()

        expect(order).toEqual(['after'])
        expect(JSON.parse(logs[0] ?? '{}')).toMatchObject({ event: 'shutdown_step_failed', message: '닫기 실패', step: 'broken' })
    })

    test('두 번째 신호는 무시합니다', async () => {
        let runCount = 0
        const shutdown = createShutdownHandler({ steps: [{ name: 'once', run: () => void (runCount += 1) }] })

        await shutdown()
        await shutdown()

        expect(runCount).toBe(1)
    })
})

describe('registerShutdownSignals', () => {
    test('SIGINT 와 SIGTERM 에 같은 핸들러를 붙입니다', () => {
        const registered: string[] = []

        registerShutdownSignals(
            async () => undefined,
            (signal) => {
                registered.push(String(signal))
                return process
            },
        )

        expect(registered).toEqual(['SIGINT', 'SIGTERM'])
    })
})

describe('createServerDrain', () => {
    const createServer = (pending: number[]) => {
        const stopCalls: (boolean | undefined)[] = []
        let index = 0
        const readPending = () => {
            const value = pending[Math.min(index, pending.length - 1)] ?? 0
            index += 1
            return value
        }
        const server = {
            pendingRequests: 0,
            stop: (closeActiveConnections?: boolean) => stopCalls.push(closeActiveConnections),
        }
        Object.defineProperty(server, 'pendingRequests', { get: readPending })

        return { server, stopCalls }
    }

    test('먼저 수신을 멈추고 남은 요청이 끝나면 종료합니다', async () => {
        const { server, stopCalls } = createServer([2, 1, 0])
        const slept: number[] = []

        await createServerDrain({ server, timeoutMs: 10_000, sleep: async (ms) => void slept.push(ms) })()

        expect(stopCalls).toEqual([false, true])
        expect(slept.length).toBe(2)
    })

    test('요청이 남아도 상한을 넘기면 강제 종료합니다', async () => {
        const { server, stopCalls } = createServer([1])
        const slept: number[] = []

        await createServerDrain({ server, timeoutMs: 600, sleep: async (ms) => void slept.push(ms) })()

        expect(stopCalls).toEqual([false, true])
        expect(slept.reduce((total, value) => total + value, 0)).toBe(600)
    })

    test('진행 중 요청이 없으면 기다리지 않습니다', async () => {
        const { server, stopCalls } = createServer([0])
        const slept: number[] = []

        await createServerDrain({ server, timeoutMs: 10_000, sleep: async (ms) => void slept.push(ms) })()

        expect(stopCalls).toEqual([false, true])
        expect(slept).toEqual([])
    })
})
