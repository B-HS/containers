import { describe, expect, test } from 'bun:test'
import { createMaintenanceService } from './create-maintenance-service'

const createTestService = () => {
    const clock = { value: Date.parse('2026-08-01T00:00:00.000Z') }
    const service = createMaintenanceService({
        now: () => new Date(clock.value),
        sleep: async (milliseconds) => {
            clock.value += milliseconds
        },
    })
    return { clock, service }
}

describe('maintenance 서비스', () => {
    test('enable 은 한 번만 적용되고 상태를 노출합니다', () => {
        const { service } = createTestService()

        expect(service.getStatus().enabled).toBe(false)
        expect(service.enable('backup-restore')).toBe(true)
        expect(service.enable('manual')).toBe(false)
        expect(service.getStatus()).toEqual({ enabled: true, reason: 'backup-restore', startedAt: '2026-08-01T00:00:00.000Z' })

        service.disable()
        expect(service.getStatus().enabled).toBe(false)
    })

    test('drain 은 in-flight mutation 이 끝날 때까지 기다리고 시한을 넘기면 실패합니다', async () => {
        const { service } = createTestService()
        service.enter()
        service.enter()
        service.leave()

        const drainWithRelease = async () => {
            const draining = service.drain(10_000)
            service.leave()
            await draining
        }
        await drainWithRelease()
        expect(service.getInflightMutationCount()).toBe(0)

        service.enter()
        await expect(service.drain(1_000)).rejects.toThrow('MAINTENANCE_DRAIN_TIMEOUT')
    })
})
