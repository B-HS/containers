import { describe, expect, test } from 'bun:test'
import type { OperationJob } from '@containers/contracts/operation-job'
import { createBackupScheduleService } from './create-backup-schedule-service'

const NOW = new Date('2026-08-01T12:00:00.000Z')

const createJob = (values: Partial<OperationJob>): OperationJob => ({
    attempt: 1,
    cancelRequestedAt: null,
    createdAt: NOW.toISOString(),
    createdBy: null,
    failureCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa',
    kind: 'backup.create',
    maxAttempts: 3,
    payload: {},
    progressStep: null,
    resourceKey: null,
    result: null,
    scheduledAt: NOW.toISOString(),
    startedAt: null,
    status: 'succeeded',
    updatedAt: NOW.toISOString(),
    ...values,
})

const createManifest = (createdAt: string) => ({
    controlBytes: 1,
    controlSha256: 'a'.repeat(64),
    createdAt,
    id: '374f1798-c75f-4152-938d-be2d09d12d51',
    label: 'automatic',
    schemaVersion: 1 as const,
    trafficBytes: 1,
    trafficSha256: 'b'.repeat(64),
})

describe('backup schedule 서비스', () => {
    test('최신 backup 시각에서 다음 실행을 유도하고 성공·실패 이력을 노출합니다', async () => {
        const service = createBackupScheduleService({
            backupService: { list: async () => [createManifest('2026-08-01T06:00:00.000Z')] },
            intervalHours: 24,
            now: () => NOW,
            operationJobService: {
                enqueue: async () => createJob({}),
                list: async () => [
                    createJob({ failureCode: 'BACKUP_CONTROL_INVALID', finishedAt: '2026-08-01T10:00:00.000Z', status: 'failed' }),
                    createJob({ finishedAt: '2026-08-01T06:00:01.000Z', status: 'succeeded' }),
                ],
            },
        })

        expect(await service.getSchedule()).toEqual({
            intervalHours: 24,
            lastFailureAt: '2026-08-01T10:00:00.000Z',
            lastFailureCode: 'BACKUP_CONTROL_INVALID',
            lastSuccessAt: '2026-08-01T06:00:01.000Z',
            nextRunAt: '2026-08-02T06:00:00.000Z',
        })
        expect(await service.enqueueIfDue()).toBe(false)
    })

    test('backup 이 interval 을 넘었거나 없으면 즉시 due 로 enqueue 합니다', async () => {
        const enqueued: string[] = []
        const buildService = (backups: ReturnType<typeof createManifest>[]) =>
            createBackupScheduleService({
                backupService: { list: async () => backups },
                intervalHours: 1,
                now: () => NOW,
                operationJobService: {
                    enqueue: async (input) => {
                        enqueued.push(input.kind)
                        return createJob({ status: 'queued' })
                    },
                    list: async () => [],
                },
            })

        expect(await buildService([]).enqueueIfDue()).toBe(true)
        expect(await buildService([createManifest('2026-08-01T10:00:00.000Z')]).enqueueIfDue()).toBe(true)
        expect((await buildService([createManifest('2026-08-01T10:00:00.000Z')]).getSchedule()).nextRunAt).toBe(NOW.toISOString())
        expect(enqueued).toEqual(['backup.create', 'backup.create'])
    })
})
