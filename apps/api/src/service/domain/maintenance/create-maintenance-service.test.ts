import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createControlDatabase } from '@containers/db-schema/database'
import { buildMaintenanceServiceDb } from '../../../compose/compose-maintenance'
import { createMaintenanceService, type MaintenanceRecord, type MaintenanceServiceDb } from './create-maintenance-service'

const createMemoryDb = (): MaintenanceServiceDb => {
    let record: MaintenanceRecord | null = null
    return {
        clear: () => {
            record = null
        },
        load: () => record,
        save: ({ actorId, jobId, reason, startedAt }) => {
            record = { actorId, jobId, reason, startedAt }
        },
    }
}

const createTestService = (db: MaintenanceServiceDb = createMemoryDb()) => {
    const clock = { value: Date.parse('2026-08-01T00:00:00.000Z') }
    const service = createMaintenanceService({
        db,
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
        expect(service.enable('backup-restore', { jobId: 'job-1' })).toBe(true)
        expect(service.enable('manual')).toBe(false)
        expect(service.getStatus()).toEqual({
            actorId: null,
            enabled: true,
            jobId: 'job-1',
            reason: 'backup-restore',
            startedAt: '2026-08-01T00:00:00.000Z',
        })

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

    test('control DB 에 상태를 남겨 재시작 후에도 maintenance 를 복원합니다', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'containers-maintenance-'))
        try {
            const database = createControlDatabase({
                filePath: join(directory, 'control.sqlite'),
                migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
            })
            const db = buildMaintenanceServiceDb(database.db)

            createTestService(db).service.enable('backup-restore', { actorId: 'user-1', jobId: 'job-1' })

            const restarted = createTestService(db).service
            expect(restarted.isEnabled()).toBe(true)
            expect(restarted.getStatus()).toEqual({
                actorId: 'user-1',
                enabled: true,
                jobId: 'job-1',
                reason: 'backup-restore',
                startedAt: '2026-08-01T00:00:00.000Z',
            })

            restarted.disable()
            expect(createTestService(db).service.isEnabled()).toBe(false)
            database.sqlite.close()
        } finally {
            await rm(directory, { force: true, recursive: true })
        }
    })
})
