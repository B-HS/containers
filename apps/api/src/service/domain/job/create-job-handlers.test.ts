import { describe, expect, test } from 'bun:test'
import type { DeploymentRelease } from '@containers/contracts/deployment'
import type { OperationJob } from '@containers/contracts/operation-job'
import { createAppError } from '../../../lib/error'
import { createJobHandlers } from './create-job-handlers'

const ACTOR_ID = 'test-owner'
const ARTIFACT_ID = '5a0c1b2e-1b0a-4f6f-9c3a-6d2f0f4b8c11'
const BACKUP_ID = '374f1798-c75f-4152-938d-be2d09d12d51'
const DEPLOYMENT_ID = 'f0f1b6d4-1c2b-4f4a-9d3e-8b7a6c5d4e33'
const MANIFEST_ID = '9d3f6a71-2c4b-4b8e-8f1a-3e5d7c9b0a22'
const PRUNE_PREVIEW_SHA = 'a'.repeat(64)
const RELEASE_ID = 'c4e2d1a0-7b6c-4d5e-8f90-1a2b3c4d5e6f'
const SESSION_ID = '3b8e5f27-9a1d-4c6b-8e2f-7d0c1a9b4e55'

const createJob = (kind: OperationJob['kind'], payload: Record<string, unknown>, createdBy: string | null = null): OperationJob => ({
    attempt: 1,
    cancelRequestedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy,
    failureCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa',
    kind,
    maxAttempts: 1,
    payload,
    progressStep: null,
    resourceKey: null,
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

const unusedDependencies = {
    deploymentReleaseService: {
        run: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        runRollback: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    deploymentService: {
        loadArtifact: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    uploadService: {
        finalizeSession: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
}

const idleDependencies = {
    ...unusedDependencies,
    backupService: {
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        restore: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    engineAgentClient: engineAgentClientStub,
    maintenanceService: { disable: () => undefined, drain: async () => undefined, enable: () => true },
    notificationDeliveryService: { handleDeliver: async () => null },
}

const createRelease = (overrides: Partial<DeploymentRelease> = {}): DeploymentRelease => ({
    activatedAt: null,
    containerId: 'container-id',
    containerName: 'workload-blue',
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: ACTOR_ID,
    failureCode: null,
    finishedAt: null,
    id: RELEASE_ID,
    manifestId: MANIFEST_ID,
    nginxConfigSha256: null,
    nginxRouteId: null,
    previousReleaseId: null,
    status: 'healthy',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
})

const captureFailure = async (execute: () => Promise<unknown>) => {
    try {
        await execute()
        return null
    } catch (error) {
        return error as Error & { terminal?: boolean }
    }
}

const captureFinalizeFailure = async (thrown: Error) => {
    const handlers = createJobHandlers({
        ...idleDependencies,
        uploadService: {
            finalizeSession: async () => {
                throw thrown
            },
        },
    })
    return captureFailure(() => handlers['upload.finalize'](createContext(createJob('upload.finalize', { sessionId: SESSION_ID }, ACTOR_ID))))
}

describe('job handler factory', () => {
    test('restore handler 는 maintenance enable→drain→restore→disable 순서로 수행합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            ...unusedDependencies,
            engineAgentClient: engineAgentClientStub,
            notificationDeliveryService: { handleDeliver: async () => null },
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async (id) => {
                    calls.push(`restore:${id}`)
                    return {
                        backup: undefined as never,
                        mode: 'preserve-host' as const,
                        recoveryBackupId: 'recovery-id',
                        restored: true as const,
                        secretsRestored: false,
                    }
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
        expect(result).toEqual({
            backupId: BACKUP_ID,
            mode: 'preserve-host',
            recoveryBackupId: 'recovery-id',
            restored: true,
            secretsRestored: false,
        })
    })

    test('수동 maintenance 가 이미 켜져 있으면 restore 후에도 끄지 않고, 실패해도 정리는 수행합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            ...unusedDependencies,
            engineAgentClient: engineAgentClientStub,
            notificationDeliveryService: { handleDeliver: async () => null },
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
            ...unusedDependencies,
            engineAgentClient: engineAgentClientStub,
            notificationDeliveryService: { handleDeliver: async () => null },
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
            ...unusedDependencies,
            engineAgentClient: engineAgentClientStub,
            notificationDeliveryService: { handleDeliver: async () => null },
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
            ...unusedDependencies,
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
            notificationDeliveryService: { handleDeliver: async () => null },
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
            ...unusedDependencies,
            engineAgentClient: engineAgentClientStub,
            notificationDeliveryService: { handleDeliver: async () => null },
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
            ...unusedDependencies,
            backupService: {
                create: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
                restore: async () => {
                    throw createAppError('테스트에서 호출되지 않습니다.')
                },
            },
            notificationDeliveryService: { handleDeliver: async () => null },
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

    test('deploy load handler 는 job actor 로 artifact 를 로드하고 deployment 결과를 반환합니다', async () => {
        const calls: string[] = []
        const handlers = createJobHandlers({
            ...idleDependencies,
            deploymentService: {
                loadArtifact: async (artifactId, actorId) => {
                    calls.push(`${artifactId}:${actorId}`)
                    return {
                        artifactId,
                        createdAt: '2026-08-01T00:00:00.000Z',
                        id: DEPLOYMENT_ID,
                        messages: ['Loaded image: example:latest'],
                        status: 'loaded' as const,
                        updatedAt: '2026-08-01T00:00:01.000Z',
                    }
                },
            },
        })

        const result = await handlers['deploy.load'](createContext(createJob('deploy.load', { artifactId: ARTIFACT_ID }, ACTOR_ID)))

        expect(calls).toEqual([`${ARTIFACT_ID}:${ACTOR_ID}`])
        expect(result).toEqual({ deploymentId: DEPLOYMENT_ID, messages: ['Loaded image: example:latest'] })

        const actorless = handlers['deploy.load'](createContext(createJob('deploy.load', { artifactId: ARTIFACT_ID })))
        await expect(actorless).rejects.toThrow('JOB_ACTOR_MISSING')
        expect(calls).toHaveLength(1)
    })

    test('upload finalize handler 는 artifact id 를 반환하고 actor 가 없으면 terminal 로 실패합니다', async () => {
        const handlers = createJobHandlers({
            ...idleDependencies,
            uploadService: {
                finalizeSession: async () => ({
                    createdAt: '2026-08-01T00:00:00.000Z',
                    fileName: 'image.tar',
                    id: ARTIFACT_ID,
                    mediaType: 'application/vnd.docker.image.rootfs.diff.tar',
                    sha256: 'a'.repeat(64),
                    sizeBytes: 1,
                    status: 'ready' as const,
                }),
            },
        })

        expect(await handlers['upload.finalize'](createContext(createJob('upload.finalize', { sessionId: SESSION_ID }, ACTOR_ID)))).toEqual({
            artifactId: ARTIFACT_ID,
        })

        const failure = await captureFailure(() =>
            handlers['upload.finalize'](createContext(createJob('upload.finalize', { sessionId: SESSION_ID }))),
        )
        expect(failure?.message).toBe('JOB_ACTOR_MISSING')
        expect(failure?.terminal).toBe(true)
    })

    test('upload finalize handler 는 검증 오류만 terminal 로 바꾸고 나머지는 그대로 던집니다', async () => {
        for (const code of ['ARTIFACT_DIGEST_MISMATCH', 'UPLOAD_INCOMPLETE', 'UPLOAD_SESSION_INVALID']) {
            const failure = await captureFinalizeFailure(createAppError(code))
            expect(failure?.message).toBe(code)
            expect(failure?.terminal).toBe(true)
        }

        const transient = createAppError('DISK_HARD_WATERMARK')
        expect(await captureFinalizeFailure(transient)).toBe(transient)
    })

    test('deploy release handler 는 healthy 만 성공으로 보고 그 외에는 failureCode 로 terminal 실패합니다', async () => {
        const healthyHandlers = createJobHandlers({
            ...idleDependencies,
            deploymentReleaseService: { ...unusedDependencies.deploymentReleaseService, run: async () => createRelease() },
        })

        expect(await healthyHandlers['deploy.release'](createContext(createJob('deploy.release', { releaseId: RELEASE_ID }, ACTOR_ID)))).toEqual({
            releaseId: RELEASE_ID,
            status: 'healthy',
        })

        const failedHandlers = createJobHandlers({
            ...idleDependencies,
            deploymentReleaseService: {
                ...unusedDependencies.deploymentReleaseService,
                run: async () => createRelease({ failureCode: 'DEPLOYMENT_PROBE_FAILED', status: 'failed' }),
            },
        })
        const failure = await captureFailure(() =>
            failedHandlers['deploy.release'](createContext(createJob('deploy.release', { releaseId: RELEASE_ID }, ACTOR_ID))),
        )
        expect(failure?.message).toBe('DEPLOYMENT_PROBE_FAILED')
        expect(failure?.terminal).toBe(true)
    })

    test('deploy rollback handler 는 rolled-back 만 성공으로 보고 그 외에는 failureCode 로 terminal 실패합니다', async () => {
        const rolledBackHandlers = createJobHandlers({
            ...idleDependencies,
            deploymentReleaseService: {
                ...unusedDependencies.deploymentReleaseService,
                runRollback: async () => createRelease({ status: 'rolled-back' }),
            },
        })

        expect(await rolledBackHandlers['deploy.rollback'](createContext(createJob('deploy.rollback', { releaseId: RELEASE_ID }, ACTOR_ID)))).toEqual(
            { releaseId: RELEASE_ID, status: 'rolled-back' },
        )

        const failedHandlers = createJobHandlers({
            ...idleDependencies,
            deploymentReleaseService: {
                ...unusedDependencies.deploymentReleaseService,
                runRollback: async () => createRelease({ failureCode: null, status: 'healthy' }),
            },
        })
        const failure = await captureFailure(() =>
            failedHandlers['deploy.rollback'](createContext(createJob('deploy.rollback', { releaseId: RELEASE_ID }, ACTOR_ID))),
        )
        expect(failure?.message).toBe('DEPLOYMENT_ROLLBACK_FAILED')
        expect(failure?.terminal).toBe(true)
    })
})
