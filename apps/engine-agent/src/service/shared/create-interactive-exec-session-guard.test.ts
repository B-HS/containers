import { describe, expect, test } from 'bun:test'
import { createInteractiveExecSessionGuard } from './create-interactive-exec-session-guard'

describe('Interactive exec session guard', () => {
    test('idle session을 종료하고 stop 이후 callback을 반복하지 않습니다', async () => {
        let idleCount = 0
        let maxDurationCount = 0
        const guard = createInteractiveExecSessionGuard({
            idleTimeoutMs: 20,
            maxDurationMs: 100,
            onIdleTimeout: () => {
                idleCount += 1
            },
            onMaxDuration: () => {
                maxDurationCount += 1
            },
        })

        guard.start()
        await Bun.sleep(50)

        expect(idleCount).toBe(1)
        expect(maxDurationCount).toBe(0)
    })

    test('touch로 idle을 갱신해도 max duration은 연장하지 않습니다', async () => {
        let idleCount = 0
        let maxDurationCount = 0
        const guard = createInteractiveExecSessionGuard({
            idleTimeoutMs: 35,
            maxDurationMs: 80,
            onIdleTimeout: () => {
                idleCount += 1
            },
            onMaxDuration: () => {
                maxDurationCount += 1
            },
        })

        guard.start()
        await Bun.sleep(25)
        guard.touch()
        await Bun.sleep(25)
        guard.touch()
        await Bun.sleep(40)

        expect(idleCount).toBe(0)
        expect(maxDurationCount).toBe(1)
    })
})
