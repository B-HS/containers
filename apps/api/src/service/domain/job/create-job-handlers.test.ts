import { describe, expect, test } from 'bun:test'
import type { OperationJob } from '@containers/contracts/operation-job'
import { createAppError } from '../../../lib/app-error'
import { createJobHandlers } from './create-job-handlers'

const BACKUP_ID = '374f1798-c75f-4152-938d-be2d09d12d51'
const PRUNE_PREVIEW_SHA = 'a'.repeat(64)

const createJob = (kind: OperationJob['kind'], payload: Record<string, unknown>): OperationJob => ({
    attempt: 1,
    cancelRequestedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: null,
    failureCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa',
    kind,
    maxAttempts: 1,
    payload,
    progressStep: null,
    result: null,
    scheduledAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    status: 'running',
    updatedAt: '2026-08-01T00:00:00.000Z',
})

const createContext = (job: OperationJob) => ({
    isCancelRequested: async () => false,
    job,
    reportProgress: async () => undefined,
})

const engineAgentClientStub = {
    getPrunePreview: async () => ({
        buildCache: [],
        containers: [],
        images: [],
        networks: [],
        protectedResourceCount: 0,
        reclaimableBytes: 0,
        sha256: PRUNE_PREVIEW_SHA,
        volumes: [],
    }),
    performContainerAction: async () => ({ operation: 'remove', targetId: 'container-id' }),
    pruneBuildCache: async () => ({ deletedIds: [], spaceReclaimed: 0 }),
    pullImage: async () => ({ messages: ['Status: Downloaded newer image'], reference: 'alpine:3.20' }),
    removeImage: async () => ({ operation: 'remove-image', targetId: 'image-id' }),
    removeNetwork: async () => ({ operation: 'remove-network', targetId: 'network-id' }),
    removeVolume: async () => ({ operation: 'remove-volume', targetId: 'volume-name' }),
}

describe('job handler factory', () => {
    test('restore handler 는 maintenance enable→drain→restore→disable 순서로 수행합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            engineAgentClient: engineAgentClientStub,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async (id) => {
                    calls.push(`restore:${id}`)
                    return { backup: undefined as never, recoveryBackupId: 'recovery-id', restored: true as const }
                },
            },
            maintenanceService: {
                disable: () => {
                    calls.push('disable')
                },
                drain: async () => {
                    calls.push('drain')
                },
                enable: (reason) => {
                    calls.push(`enable:${reason}`)
                    return true
                },
            },
        })

        const result = await handlers['backup.restore'](createContext(createJob('backup.restore', { backupId: BACKUP_ID, confirmation: BACKUP_ID })))

        expect(calls).toEqual(['enable:backup-restore', 'drain', `restore:${BACKUP_ID}`, 'disable'])
        expect(result).toEqual({ backupId: BACKUP_ID, recoveryBackupId: 'recovery-id', restored: true })
    })

    test('수동 maintenance 가 이미 켜져 있으면 restore 후에도 끄지 않고, 실패해도 정리는 수행합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            engineAgentClient: engineAgentClientStub,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('BACKUP_DIGEST_MISMATCH')
                },
            },
            maintenanceService: {
                disable: () => {
                    calls.push('disable')
                },
                drain: async () => undefined,
                enable: () => false,
            },
        })

        await expect(
            handlers['backup.restore'](createContext(createJob('backup.restore', { backupId: BACKUP_ID, confirmation: BACKUP_ID }))),
        ).rejects.toThrow('BACKUP_DIGEST_MISMATCH')
        expect(calls).toEqual([])
    })

    test('image pull handler 는 reference 를 검증하고 pull 결과를 반환합니다', async () => {
        const handlers = createJobHandlers({
            engineAgentClient: engineAgentClientStub,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            maintenanceService: { disable: () => undefined, drain: async () => undefined, enable: () => true },
        })

        expect(await handlers['image.pull'](createContext(createJob('image.pull', { reference: 'alpine:3.20' })))).toEqual({
            messages: ['Status: Downloaded newer image'],
            reference: 'alpine:3.20',
        })
        await expect(handlers['image.pull'](createContext(createJob('image.pull', { reference: 'bad reference!!' })))).rejects.toThrow()
    })

    test('restore payload 가 계약과 다르면 실행 전에 실패합니다', async () => {
        const handlers = createJobHandlers({
            engineAgentClient: engineAgentClientStub,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            maintenanceService: { disable: () => undefined, drain: async () => undefined, enable: () => true },
        })

        await expect(handlers['backup.restore'](createContext(createJob('backup.restore', { backupId: 'not-a-uuid' })))).rejects.toThrow()
    })

    test('system prune handler 는 preview SHA를 재검증하고 후보별 취소 지점을 거쳐 순서대로 삭제합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            engineAgentClient: {
                ...engineAgentClientStub,
                getPrunePreview: async () => ({
                    buildCache: [{ id: 'cache-id', name: null, reclaimableBytes: 5 }],
                    containers: [{ id: 'container-id', name: 'workload', reclaimableBytes: 10 }],
                    images: [{ id: 'sha256:image-id', name: null, reclaimableBytes: 20 }],
                    networks: [{ id: 'network-id', name: 'workload-edge', reclaimableBytes: 0 }],
                    protectedResourceCount: 4,
                    reclaimableBytes: 65,
                    sha256: PRUNE_PREVIEW_SHA,
                    volumes: [{ id: 'volume-name', name: 'volume-name', reclaimableBytes: 30 }],
                }),
                performContainerAction: async () => {
                    calls.push('container')
                    return { operation: 'remove', targetId: 'container-id' }
                },
                pruneBuildCache: async () => {
                    calls.push('build-cache')
                    return { deletedIds: ['cache-id'], spaceReclaimed: 5 }
                },
                removeImage: async () => {
                    calls.push('image')
                    return { operation: 'remove-image', targetId: 'image-id' }
                },
                removeNetwork: async () => {
                    calls.push('network')
                    return { operation: 'remove-network', targetId: 'network-id' }
                },
                removeVolume: async () => {
                    calls.push('volume')
                    return { operation: 'remove-volume', targetId: 'volume-name' }
                },
            },
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            maintenanceService: { disable: () => undefined, drain: async () => undefined, enable: () => true },
        })

        const result = await handlers['system.prune'](
            createContext(
                createJob('system.prune', {
                    confirmation: 'DELETE UNUSED RESOURCES',
                    includeVolumes: true,
                    previewSha256: PRUNE_PREVIEW_SHA,
                }),
            ),
        )

        expect(calls).toEqual(['container', 'image', 'network', 'volume', 'build-cache'])
        expect(result).toEqual({
            buildCacheDeleted: 1,
            containersDeleted: 1,
            estimatedReclaimableBytes: 65,
            imagesDeleted: 1,
            networksDeleted: 1,
            reclaimedBuildCacheBytes: 5,
            volumesDeleted: 1,
        })
    })

    test('system prune handler 는 stale preview와 실행 전 취소를 삭제 없이 거부합니다', async () => {
        const handlers = createJobHandlers({
            engineAgentClient: engineAgentClientStub,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            maintenanceService: { disable: () => undefined, drain: async () => undefined, enable: () => true },
        })
        const staleJob = createJob('system.prune', {
            confirmation: 'DELETE UNUSED RESOURCES',
            includeVolumes: false,
            previewSha256: 'b'.repeat(64),
        })

        await expect(handlers['system.prune'](createContext(staleJob))).rejects.toThrow('PRUNE_PREVIEW_STALE')

        const cancellingContext = {
            ...createContext(createJob('system.prune', { ...staleJob.payload, previewSha256: PRUNE_PREVIEW_SHA })),
            isCancelRequested: async () => true,
        }
        await expect(handlers['system.prune'](cancellingContext)).rejects.toThrow('JOB_CANCELLED')
    })

    test('traffic export handler 는 취소를 확인하고 Worker 결과만 job 결과로 저장합니다', async () => {
        let createCount = 0
        const handlers = createJobHandlers({
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            engineAgentClient: engineAgentClientStub,
            maintenanceService: {
                disable: () => undefined,
                drain: async () => undefined,
                enable: () => false,
            },
            trafficWorkerClient: {
                createExport: async (jobId, payload) => {
                    createCount += 1
                    expect(jobId).toBe('2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa')
                    expect(payload).toMatchObject({ format: 'csv' })
                    return {
                        bytes: 10,
                        fileName: `traffic-${jobId}.csv`,
                        format: 'csv' as const,
                        rowCount: 1,
                        sha256: 'a'.repeat(64),
                    }
                },
            },
        })
        const job = createJob('traffic.export', {
            format: 'csv',
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-01T01:00:00.000Z',
        })

        const result = await handlers['traffic.export'](createContext(job))
        expect(result).toMatchObject({ format: 'csv', rowCount: 1 })
        await expect(handlers['traffic.export']({ ...createContext(job), isCancelRequested: async () => true })).rejects.toThrow('JOB_CANCELLED')
        expect(createCount).toBe(1)
    })
})
