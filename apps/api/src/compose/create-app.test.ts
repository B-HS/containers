import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DeploymentRelease } from '@containers/contracts/deployment'
import { healthSchema } from '@containers/contracts/health'
import type { OperationJob } from '@containers/contracts/operation-job'
import { createAppError } from '../lib/error'
import { createApp } from './create-app'

const createEngineAgentClientStub = () => ({
    applyNginxConfig: async () => ({
        appliedAt: '2026-01-01T00:00:00.000Z',
        previousSha256: 'a'.repeat(64),
        sha256: 'b'.repeat(64),
        validationOutput: 'syntax is ok',
    }),
    connectContainerNetwork: async (containerId: string) => ({ operation: 'connect-network', targetId: containerId }),
    createContainer: async () => ({ operation: 'create-container', targetId: 'container-id' }),
    createInteractiveExecTicket: async () => ({ expiresAt: '2026-01-01T00:00:30.000Z', ticket: 't'.repeat(43) }),
    createNetwork: async () => ({ operation: 'create-network', targetId: 'network-id' }),
    createVolume: async () => ({ operation: 'create-volume', targetId: 'volume-name' }),
    disconnectContainerNetwork: async (containerId: string) => ({ operation: 'disconnect-network', targetId: containerId }),
    executeContainer: async () => ({ exitCode: 0, stderr: '', stdout: '', truncated: false }),
    getContainer: async () => ({
        args: [],
        command: ['bun'],
        createdAt: '2026-01-01T00:00:00.000Z',
        entrypoint: ['bun'],
        environmentKeys: ['PORT'],
        exposedPorts: ['3001/tcp'],
        hostname: 'api',
        id: 'container-id',
        image: 'sha256:image',
        labelKeys: [],
        mounts: [],
        name: 'api',
        networks: [],
        platform: 'linux',
        restartCount: 0,
        state: {
            error: '',
            exitCode: 0,
            finishedAt: '',
            health: 'healthy',
            paused: false,
            pid: 1,
            restarting: false,
            running: true,
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'running',
        },
        user: 'bun',
        workingDirectory: '/app',
    }),
    getContainerLogs: async () => ({ stderr: '', stdout: 'ready', truncated: false }),
    getContainers: async () => [],
    getImages: async () => [],
    getImageRemovalImpact: async (imageId: string) => ({ containers: [], imageId, isManagementPlane: false }),
    getInteractiveExecWebSocketUrl: (ticket: string) => `ws://engine-agent:3002/ws/exec/${ticket}`,
    getNetworks: async () => [],
    getOverview: async () => ({
        architecture: 'arm64',
        apiVersion: '1.52',
        containers: { paused: 0, running: 4, stopped: 0, total: 4 },
        cpus: 10,
        disk: {
            availableBytes: 600,
            buildCacheBytes: 10,
            capacityBytes: 1_000,
            containerWritableBytes: 20,
            estimatedReclaimableBytes: 30,
            layersBytes: 40,
            localVolumeBytes: 50,
            usedBytes: 400,
        },
        engineId: 'engine-id',
        engineName: 'docker-desktop',
        images: 4,
        memoryBytes: 1_024,
        minApiVersion: '1.44',
        operatingSystem: 'Docker Desktop',
        os: 'linux',
        version: '29.6.2',
    }),
    getPrunePreview: async () => ({
        buildCache: [],
        containers: [],
        images: [],
        networks: [],
        protectedResourceCount: 0,
        reclaimableBytes: 0,
        sha256: 'a'.repeat(64),
        volumes: [],
    }),
    getRegistryCredentials: async () => [],
    getVolumes: async () => [],
    getNginxConfig: async () => ({ config: 'events {}', history: [], sha256: 'a'.repeat(64) }),
    loadImage: async () => ({ messages: ['Loaded image: example:latest'], operation: 'load-image' as const, targetId: crypto.randomUUID() }),
    changesContainer: async () => [],
    topContainer: async () => ({ processes: [], titles: ['PID', 'CMD'] }),
    waitContainer: async () => ({ exitCode: 0 }),
    pullImage: async () => ({ messages: ['Status: Downloaded newer image'], reference: 'alpine:3.20' }),
    pruneBuildCache: async () => ({ deletedIds: [], spaceReclaimed: 0 }),
    tagImage: async (imageId: string) => ({ operation: 'tag-image', targetId: imageId }),
    openContainerLogStream: async () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start: (controller) => controller.close() }),
    openContainerStatsStream: async () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start: (controller) => controller.close() }),
    openEventStream: async () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start: (controller) => controller.close() }),
    performContainerAction: async (containerId: string, input: unknown) => {
        void input
        return { operation: 'start', targetId: containerId }
    },
    probeContainer: async () => ({ error: null, healthy: true, latencyMs: 1, statusCode: 200 }),
    removeImage: async (imageId: string) => ({ operation: 'remove-image', targetId: imageId }),
    removeRegistryCredential: async () => ({
        createdAt: new Date(0).toISOString(),
        id: crypto.randomUUID(),
        name: 'registry',
        serverAddress: 'registry.example.com',
        updatedAt: new Date(0).toISOString(),
        username: 'user',
        version: 1,
    }),
    removeNetwork: async (networkId: string) => ({ operation: 'remove-network', targetId: networkId }),
    removeVolume: async (volumeName: string) => ({ operation: 'remove-volume', targetId: volumeName }),
    upsertRegistryCredential: async () => ({
        createdAt: new Date(0).toISOString(),
        id: crypto.randomUUID(),
        name: 'registry',
        serverAddress: 'registry.example.com',
        updatedAt: new Date(0).toISOString(),
        username: 'user',
        version: 1,
    }),
})

const createAppTestDependencies = () => ({
    backupScheduleService: {
        getSchedule: async () => ({
            intervalHours: 24,
            lastFailureAt: null,
            lastFailureCode: null,
            lastSuccessAt: null,
            nextRunAt: '2026-01-01T00:00:00.000Z',
        }),
    },
    apiKeyService: {
        authenticate: async () => {
            throw createAppError('AUTH_REQUIRED')
        },
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        list: async () => [],
        revoke: async (id: string) => ({ id, revoked: true as const }),
    },
    auditService: {
        list: async () => ({ data: [], pagination: { limit: 50, page: 1, total: 0, totalPages: 0 } }),
        record: async () => undefined,
    },
    backupService: {
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        list: async () => [],
        remove: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        restore: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        stageRestoreSecret: () => undefined,
    },
    auth: {
        handler: async () => new Response(null, { status: 404 }),
    },
    authService: {
        acceptInvitation: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        bootstrapOwner: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        createInvitation: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        getBootstrapStatus: async () => ({ required: true }),
        getSession: async () => undefined,
        isEmailDisabled: async () => false,
        listUsers: async () => [],
        requireRecentRole: async () => {
            throw createAppError('AUTH_REQUIRED')
        },
        requireRole: async () => ({
            role: 'owner' as const,
            session: {
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                expiresAt: new Date('2026-01-02T00:00:00.000Z'),
                id: 'test-session',
                token: 'test-token',
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                userId: 'test-owner',
            },
            user: {
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                email: 'owner@example.com',
                emailVerified: true,
                id: 'test-owner',
                name: 'Owner',
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
        }),
        updateUser: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    deploymentService: {
        getLoaded: async () => null,
    },
    deploymentManifestService: {
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        get: async () => {
            throw createAppError('DEPLOYMENT_MANIFEST_NOT_FOUND')
        },
        list: async () => [],
    },
    deploymentReleaseService: {
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        get: async () => {
            throw createAppError('DEPLOYMENT_RELEASE_NOT_FOUND')
        },
        list: async () => [],
        prepareRollback: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    deploymentSecretService: {
        list: async () => [],
        remove: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        resolve: async () => [],
        upsert: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    engineAgentClient: createEngineAgentClientStub(),
    nginxStatusClient: {
        getStatus: async () => ({
            acceptedConnections: 10,
            activeConnections: 1,
            handledConnections: 10,
            readingConnections: 0,
            requests: 20,
            waitingConnections: 1,
            writingConnections: 0,
        }),
    },
    nginxProxyRouteService: {
        create: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        list: async () => [],
        remove: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    maintenanceService: {
        disable: () => undefined,
        enable: () => true,
        enter: () => undefined,
        getStatus: () => ({ actorId: null, enabled: false, jobId: null, reason: null, startedAt: null }),
        isEnabled: () => false,
        leave: () => undefined,
    },
    controlPlaneStatusService: {
        getStatus: async () => ({
            activeJobCount: 0,
            databaseIntegrity: { control: 'ok' },
            lastBackupAt: null,
            maintenance: { actorId: null, enabled: false, jobId: null, reason: null, startedAt: null },
            migrations: { applied: [], pending: [] },
            version: '0.1.0',
        }),
    },
    readinessService: {
        getReadiness: async () => ({
            checks: {
                backup: { ageSeconds: 0, lastSuccessAt: '2026-08-01T00:00:00.000Z', status: 'ok' as const, thresholdSeconds: 172_800 },
                controlDatabase: { integrity: 'ok', status: 'ok' as const },
                engineAgent: { status: 'ok' as const },
                jobs: { active: 0, stalled: 0, status: 'ok' as const },
                maintenance: { enabled: false, status: 'ok' as const },
                trafficWorker: { status: 'ok' as const },
            },
            service: 'api',
            status: 'ok' as const,
            timestamp: '2026-08-01T00:00:00.000Z',
            version: '0.1.0',
        }),
    },
    operationJobService: {
        enqueue: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        get: async () => {
            throw createAppError('JOB_NOT_FOUND')
        },
        list: async () => [],
        listEvents: async () => {
            throw createAppError('JOB_NOT_FOUND')
        },
        requestCancel: async () => {
            throw createAppError('JOB_NOT_FOUND')
        },
    },
    secretRotationService: { getState: () => ({ deploymentKeyVersion: 1, notificationKeyVersion: 1 }) },
    notificationDeliveryService: {
        deliverTest: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    notificationDestinationService: {
        list: async () => [],
        remove: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        resolveWebhook: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        setEnabled: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
        upsert: async () => {
            throw createAppError('테스트에서 호출되지 않습니다.')
        },
    },
    trafficWorkerClient: {
        getAnalytics: async () => ({
            averageResponseTimeMs: 0,
            bytesSent: 0,
            clientErrorCount: 0,
            errorRate: 0,
            events: [],
            latency: { p50Ms: 0, p95Ms: 0, p99Ms: 0 },
            requestCount: 0,
            requestsPerSecond: 0,
            serverErrorCount: 0,
            statusCounts: [],
            topPaths: [],
            windowMinutes: 60,
        }),
        getSummary: async () => ({
            averageResponseTimeMs: 10,
            bytesSent: 100,
            clientErrorCount: 0,
            requestCount: 60,
            requestsPerSecond: 1,
            serverErrorCount: 0,
            windowMinutes: 1,
        }),
        openLiveStream: async () => new Response('').body!,
    },
    uploadService: {
        appendChunk: async () => ({ receivedBytes: 1, sessionId: '01958c26-65b5-7c22-9254-03b914e61cc5' }),
        cleanupExpiredSessions: async () => 0,
        createSession: async () => ({
            expiresAt: '2026-01-02T00:00:00.000Z',
            id: '01958c26-65b5-7c22-9254-03b914e61cc5',
            maxChunkBytes: 67_108_864,
            receivedBytes: 0,
            status: 'uploading',
            warnings: [],
        }),
        getOwnedSession: async () => ({
            expiresAt: '2026-01-02T00:00:00.000Z',
            id: '01958c26-65b5-7c22-9254-03b914e61cc5',
            maxChunkBytes: 67_108_864,
            receivedBytes: 0,
            status: 'uploading',
            warnings: [],
        }),
        listArtifacts: async () => [],
    },
})

const ARTIFACT_ID = '01958c26-65b5-7c22-9254-03b914e61cc5'
const MANIFEST_ID = '9d3f6a71-2c4b-4b8e-8f1a-3e5d7c9b0a22'
const RELEASE_ID = 'c4e2d1a0-7b6c-4d5e-8f90-1a2b3c4d5e6f'

const createQueuedJob = (kind: OperationJob['kind'], resourceKey: string): OperationJob => ({
    attempt: 0,
    cancelRequestedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'test-owner',
    failureCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2ac',
    kind,
    maxAttempts: 1,
    payload: {},
    progressStep: null,
    resourceKey,
    result: null,
    scheduledAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    status: 'queued',
    updatedAt: '2026-08-01T00:00:00.000Z',
})

const createRelease = (status: DeploymentRelease['status']): DeploymentRelease => ({
    activatedAt: null,
    containerId: 'container-id',
    containerName: 'workload-blue',
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'test-owner',
    failureCode: null,
    finishedAt: null,
    id: RELEASE_ID,
    manifestId: MANIFEST_ID,
    nginxConfigSha256: null,
    nginxRouteId: null,
    previousReleaseId: null,
    status,
    updatedAt: '2026-08-01T00:00:00.000Z',
})

describe('API 애플리케이션', () => {
    test('정상 상태를 반환합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/health')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(healthSchema.parse(body.data).service).toBe('api')
    })

    test('세션 권한이 있으면 준비 상태 상세를 반환합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/readyz')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.checks.jobs).toEqual({ active: 0, stalled: 0, status: 'ok' })
        expect(body.data.version).toBe('0.1.0')
    })

    test('미인증 요청에는 check 별 status 만 노출하고 degraded 는 503 으로 응답합니다', async () => {
        const dependencies = createAppTestDependencies()
        const readiness = await dependencies.readinessService.getReadiness()
        const app = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async () => {
                    throw createAppError('AUTH_REQUIRED')
                },
            },
            readinessService: {
                getReadiness: async () => ({
                    ...readiness,
                    checks: { ...readiness.checks, engineAgent: { status: 'degraded' as const } },
                    status: 'degraded' as const,
                }),
            },
        })

        const response = await app.request('/api/readyz')
        const body = await response.json()

        expect(response.status).toBe(503)
        expect(body.data.checks).toEqual({
            backup: 'ok',
            controlDatabase: 'ok',
            engineAgent: 'degraded',
            jobs: 'ok',
            maintenance: 'ok',
            trafficWorker: 'ok',
        })
        expect(body.data.version).toBeUndefined()
    })

    test('Engine 상태를 RPC 응답 계약으로 반환합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/system/engine')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.version).toBe('29.6.2')
    })

    test('Engine 장애를 추적 가능한 공통 오류로 반환합니다', async () => {
        const app = createApp({
            ...createAppTestDependencies(),
            engineAgentClient: {
                ...createEngineAgentClientStub(),
                getOverview: async () => {
                    throw createAppError('Agent unavailable')
                },
            },
        })
        const response = await app.request('/api/system/engine')
        const body = await response.json()

        expect(response.status).toBe(503)
        expect(body.error.code).toBe('ENGINE_UNAVAILABLE')
        expect(body.error.requestId).toBeString()
    })

    test('트래픽 분석을 인증된 RPC 응답 계약으로 반환합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/traffic/analytics?windowMinutes=60&statusClass=all&limit=25')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.windowMinutes).toBe(60)
        expect(body.data.latency).toEqual({ p50Ms: 0, p95Ms: 0, p99Ms: 0 })
    })

    test('실시간 트래픽 SSE를 인증된 세션에만 전달합니다', async () => {
        const dependencies = createAppTestDependencies()
        dependencies.trafficWorkerClient.openLiveStream = async () =>
            new Response('data: {"requestId":"request-live"}\n\n', { headers: { 'content-type': 'text/event-stream' } }).body!
        const response = await createApp(dependencies).request('/api/traffic/live?statusClass=all')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/event-stream')
        expect(await response.text()).toContain('request-live')

        dependencies.authService.requireRole = async () => {
            throw createAppError('AUTH_REQUIRED')
        }
        const denied = await createApp(dependencies).request('/api/traffic/live?statusClass=all')
        expect(denied.status).toBe(401)
    })

    test('owner/admin traffic export job 생성과 완료 파일 다운로드를 제공합니다', async () => {
        const exportRoot = await mkdtemp(join(tmpdir(), 'containers-api-export-'))
        const jobId = '22222222-2222-4222-8222-222222222222'
        const fileName = `traffic-${jobId}.csv`
        await mkdir(exportRoot, { recursive: true })
        await writeFile(join(exportRoot, fileName), 'requestId\nrequest-export\n')
        const job: OperationJob = {
            attempt: 1,
            cancelRequestedAt: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            createdBy: 'user-id',
            failureCode: null,
            finishedAt: '2026-08-01T00:00:01.000Z',
            heartbeatAt: '2026-08-01T00:00:00.000Z',
            id: jobId,
            kind: 'traffic.export',
            maxAttempts: 1,
            payload: { format: 'csv', from: '2026-08-01T00:00:00.000Z', to: '2026-08-01T01:00:00.000Z' },
            progressStep: 'export',
            resourceKey: null,
            result: { bytes: 25, fileName, format: 'csv', rowCount: 1, sha256: 'a'.repeat(64) },
            scheduledAt: '2026-08-01T00:00:00.000Z',
            startedAt: '2026-08-01T00:00:00.000Z',
            status: 'succeeded',
            updatedAt: '2026-08-01T00:00:01.000Z',
        }
        const dependencies = createAppTestDependencies()
        const roleChecks: string[][] = []
        const app = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async (_headers: Headers, roles: string[]) => {
                    roleChecks.push(roles)
                    return dependencies.authService.requireRole()
                },
            },
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async () => ({ ...job, attempt: 0, finishedAt: null, result: null, status: 'queued' as const }),
                get: async () => job,
            },
            trafficExportRoot: exportRoot,
        })

        try {
            const createResponse = await app.request('/api/traffic/exports', {
                body: JSON.stringify(job.payload),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            expect(createResponse.status).toBe(202)
            expect((await createResponse.json()).data.kind).toBe('traffic.export')

            const downloadResponse = await app.request(`/api/traffic/exports/${jobId}/download`)
            expect(downloadResponse.status).toBe(200)
            expect(downloadResponse.headers.get('content-disposition')).toContain(fileName)
            expect(await downloadResponse.text()).toContain('request-export')
            expect(roleChecks).toEqual([
                ['owner', 'admin'],
                ['owner', 'admin'],
            ])
        } finally {
            await rm(exportRoot, { force: true, recursive: true })
        }
    })

    test('Docker 네트워크와 볼륨 목록을 인증된 계약으로 반환합니다', async () => {
        const app = createApp(createAppTestDependencies())
        const [networkResponse, volumeResponse] = await Promise.all([app.request('/api/networks'), app.request('/api/volumes')])

        expect(networkResponse.status).toBe(200)
        expect(volumeResponse.status).toBe(200)
        expect((await networkResponse.json()).data).toEqual([])
        expect((await volumeResponse.json()).data).toEqual([])
    })

    test('prune preview와 image 삭제 영향도를 인증된 조회 계약으로 반환합니다', async () => {
        const app = createApp(createAppTestDependencies())
        const [previewResponse, impactResponse] = await Promise.all([
            app.request('/api/system/prune-preview?includeVolumes=true'),
            app.request('/api/images/image-id/removal-impact'),
        ])

        expect(previewResponse.status).toBe(200)
        expect((await previewResponse.json()).data).toMatchObject({ protectedResourceCount: 0, reclaimableBytes: 0, volumes: [] })
        expect(impactResponse.status).toBe(200)
        expect((await impactResponse.json()).data).toEqual({ containers: [], imageId: 'image-id', isManagementPlane: false })
    })

    test('registry credential은 Owner 최근 인증으로 Agent에 저장하고 secret을 audit에 남기지 않습니다', async () => {
        const dependencies = createAppTestDependencies()
        const auditRecords: unknown[] = []
        let agentInput: unknown
        const credential = {
            createdAt: '2026-08-01T00:00:00.000Z',
            id: 'd7506e8c-9442-4cc0-9f58-27b55693bb1b',
            name: 'Private registry',
            serverAddress: 'registry.example.com',
            updatedAt: '2026-08-01T00:00:00.000Z',
            username: 'robot',
            version: 1,
        }
        const app = createApp({
            ...dependencies,
            auditService: { ...dependencies.auditService, record: async (record) => void auditRecords.push(record) },
            authService: { ...dependencies.authService, requireRecentRole: dependencies.authService.requireRole },
            engineAgentClient: {
                ...dependencies.engineAgentClient,
                upsertRegistryCredential: async (_credentialId, input) => {
                    agentInput = input
                    return credential
                },
            },
        })
        const response = await app.request('/api/registry-credentials', {
            body: JSON.stringify({
                name: credential.name,
                password: 'private-password',
                serverAddress: credential.serverAddress,
                username: credential.username,
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })

        expect(response.status).toBe(201)
        expect((await response.json()).data).toEqual(credential)
        expect(agentInput).toMatchObject({ password: 'private-password', serverAddress: credential.serverAddress })
        expect(JSON.stringify(auditRecords)).not.toContain('private-password')
    })

    test('인증 image pull job payload에는 credential ID만 저장합니다', async () => {
        const dependencies = createAppTestDependencies()
        let enqueuedInput: Record<string, unknown> | undefined
        const app = createApp({
            ...dependencies,
            authService: { ...dependencies.authService, requireRecentRole: dependencies.authService.requireRole },
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async (input) => {
                    enqueuedInput = input
                    return {
                        attempt: 0,
                        cancelRequestedAt: null,
                        createdAt: '2026-08-01T00:00:00.000Z',
                        createdBy: 'test-owner',
                        failureCode: null,
                        finishedAt: null,
                        heartbeatAt: null,
                        id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2ab',
                        kind: 'image.pull' as const,
                        maxAttempts: 3,
                        payload: input.payload,
                        progressStep: null,
                        resourceKey: null,
                        result: null,
                        scheduledAt: '2026-08-01T00:00:00.000Z',
                        startedAt: null,
                        status: 'queued' as const,
                        updatedAt: '2026-08-01T00:00:00.000Z',
                    }
                },
            },
        })
        const response = await app.request('/api/images/pull', {
            body: JSON.stringify({
                credentialId: 'd7506e8c-9442-4cc0-9f58-27b55693bb1b',
                reference: 'registry.example.com/team/image:1',
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })

        expect(response.status).toBe(202)
        expect(enqueuedInput).toMatchObject({
            kind: 'image.pull',
            payload: {
                credentialId: 'd7506e8c-9442-4cc0-9f58-27b55693bb1b',
                reference: 'registry.example.com/team/image:1',
            },
        })
        expect(JSON.stringify(enqueuedInput)).not.toContain('password')
    })

    test('system prune은 Owner 최근 인증과 일치하는 preview SHA로 단일 attempt job을 생성합니다', async () => {
        const dependencies = createAppTestDependencies()
        let enqueuedInput: Record<string, unknown> | undefined
        let recentRoles: string[] = []
        const job = {
            attempt: 0,
            cancelRequestedAt: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            createdBy: 'test-owner',
            failureCode: null,
            finishedAt: null,
            heartbeatAt: null,
            id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa',
            kind: 'system.prune' as const,
            maxAttempts: 1,
            payload: {},
            progressStep: null,
            resourceKey: null,
            result: null,
            scheduledAt: '2026-08-01T00:00:00.000Z',
            startedAt: null,
            status: 'queued' as const,
            updatedAt: '2026-08-01T00:00:00.000Z',
        }
        const app = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRecentRole: async (headers, roles) => {
                    void headers
                    recentRoles = roles
                    return dependencies.authService.requireRole()
                },
            },
            engineAgentClient: {
                ...dependencies.engineAgentClient,
                getPrunePreview: async () => ({
                    buildCache: [],
                    containers: [{ id: 'container-id', name: 'workload', reclaimableBytes: 10 }],
                    images: [],
                    networks: [],
                    protectedResourceCount: 5,
                    reclaimableBytes: 10,
                    sha256: 'a'.repeat(64),
                    volumes: [],
                }),
            },
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async (input) => {
                    enqueuedInput = input
                    return job
                },
            },
        })
        const response = await app.request('/api/system/prune', {
            body: JSON.stringify({
                confirmation: 'DELETE UNUSED RESOURCES',
                includeVolumes: false,
                previewSha256: 'a'.repeat(64),
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })

        expect(response.status).toBe(202)
        expect((await response.json()).data.id).toBe(job.id)
        expect(enqueuedInput).toMatchObject({ kind: 'system.prune', maxAttempts: 1, unique: true })
        expect(recentRoles).toEqual(['owner'])
    })

    test('system prune은 stale preview SHA를 job 생성 전에 거부합니다', async () => {
        const dependencies = createAppTestDependencies()
        const app = createApp({
            ...dependencies,
            authService: { ...dependencies.authService, requireRecentRole: dependencies.authService.requireRole },
        })
        const response = await app.request('/api/system/prune', {
            body: JSON.stringify({
                confirmation: 'DELETE UNUSED RESOURCES',
                includeVolumes: false,
                previewSha256: 'b'.repeat(64),
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })

        expect(response.status).toBe(409)
        expect((await response.json()).error.code).toBe('PRUNE_PREVIEW_STALE')
    })

    test('감사 기록을 인증된 계약으로 반환합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/audit?limit=20')

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual([])
    })

    test('배포 manifest 목록을 인증된 계약으로 반환합니다', async () => {
        const app = createApp(createAppTestDependencies())
        const [manifestResponse, releaseResponse] = await Promise.all([
            app.request('/api/deployment-manifests'),
            app.request('/api/deployment-releases'),
        ])

        expect(manifestResponse.status).toBe(200)
        expect(releaseResponse.status).toBe(200)
        expect((await manifestResponse.json()).data).toEqual([])
        expect((await releaseResponse.json()).data).toEqual([])
    })

    test('artifact load 는 이미 loaded 면 200 deployment, 아니면 202 job 을 반환합니다', async () => {
        const dependencies = createAppTestDependencies()
        const authService = { ...dependencies.authService, requireRecentRole: dependencies.authService.requireRole }
        let enqueuedInput: Record<string, unknown> | undefined
        const jobApp = createApp({
            ...dependencies,
            authService,
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async (input) => {
                    enqueuedInput = input
                    return createQueuedJob('deploy.load', ARTIFACT_ID)
                },
            },
        })

        const jobResponse = await jobApp.request(`/api/artifacts/${ARTIFACT_ID}/load`, { method: 'POST' })
        expect(jobResponse.status).toBe(202)
        expect((await jobResponse.json()).data.job.kind).toBe('deploy.load')
        expect(enqueuedInput).toMatchObject({ kind: 'deploy.load', payload: { artifactId: ARTIFACT_ID }, uniqueResourceKey: ARTIFACT_ID })

        const loaded = {
            artifactId: ARTIFACT_ID,
            createdAt: '2026-01-01T00:00:00.000Z',
            id: '01958c26-65b5-7c22-9254-03b914e61cc6',
            messages: [],
            status: 'loaded' as const,
            updatedAt: '2026-01-01T00:00:01.000Z',
        }
        const loadedApp = createApp({
            ...dependencies,
            authService,
            deploymentService: { ...dependencies.deploymentService, getLoaded: async () => loaded },
        })

        const loadedResponse = await loadedApp.request(`/api/artifacts/${ARTIFACT_ID}/load`, { method: 'POST' })
        expect(loadedResponse.status).toBe(200)
        expect((await loadedResponse.json()).data.deployment).toEqual(loaded)
    })

    test('upload finalize 는 202 job 을 반환하고 없는 session 은 job 없이 410 으로 거부합니다', async () => {
        const dependencies = createAppTestDependencies()
        const sessionId = ARTIFACT_ID
        let enqueueCount = 0
        const operationJobService = {
            ...dependencies.operationJobService,
            enqueue: async () => {
                enqueueCount += 1
                return createQueuedJob('upload.finalize', sessionId)
            },
        }
        const app = createApp({ ...dependencies, operationJobService })

        const response = await app.request(`/api/uploads/sessions/${sessionId}/finalize`, { method: 'POST' })
        expect(response.status).toBe(202)
        expect((await response.json()).data.job.kind).toBe('upload.finalize')
        expect(enqueueCount).toBe(1)

        const missingApp = createApp({
            ...dependencies,
            operationJobService,
            uploadService: { ...dependencies.uploadService, getOwnedSession: async () => null },
        })
        const missingResponse = await missingApp.request(`/api/uploads/sessions/${sessionId}/finalize`, { method: 'POST' })

        expect(missingResponse.status).toBe(410)
        expect((await missingResponse.json()).error.code).toBe('UPLOAD_SESSION_INVALID')
        expect(enqueueCount).toBe(1)
    })

    test('release 생성과 rollback 은 202 로 release 와 job 을 함께 반환합니다', async () => {
        const dependencies = createAppTestDependencies()
        const enqueuedKinds: string[] = []
        const app = createApp({
            ...dependencies,
            authService: { ...dependencies.authService, requireRecentRole: dependencies.authService.requireRole },
            deploymentReleaseService: {
                ...dependencies.deploymentReleaseService,
                create: async () => createRelease('creating'),
                prepareRollback: async () => createRelease('rolling-back'),
            },
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async (input) => {
                    enqueuedKinds.push(input.kind)
                    return createQueuedJob(input.kind, RELEASE_ID)
                },
            },
        })

        const createResponse = await app.request(`/api/deployment-manifests/${MANIFEST_ID}/releases`, { method: 'POST' })
        expect(createResponse.status).toBe(202)
        const createBody = await createResponse.json()
        expect(createBody.data.release.status).toBe('creating')
        expect(createBody.data.job).toMatchObject({ kind: 'deploy.release', resourceKey: RELEASE_ID })

        const rollbackResponse = await app.request(`/api/deployment-releases/${RELEASE_ID}/rollback`, { method: 'POST' })
        expect(rollbackResponse.status).toBe(202)
        const rollbackBody = await rollbackResponse.json()
        expect(rollbackBody.data.release.status).toBe('rolling-back')
        expect(rollbackBody.data.job).toMatchObject({ kind: 'deploy.rollback', resourceKey: RELEASE_ID })
        expect(enqueuedKinds).toEqual(['deploy.release', 'deploy.rollback'])
    })

    test('실시간 stream proxy 는 SSE 응답과 미인증 거부를 반환합니다', async () => {
        const dependencies = createAppTestDependencies()
        const app = createApp(dependencies)
        const streamResponse = await app.request('/api/stream/events')

        expect(streamResponse.status).toBe(200)
        expect(streamResponse.headers.get('content-type')).toBe('text/event-stream')

        const denied = await createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async () => {
                    throw createAppError('AUTH_REQUIRED')
                },
            },
        }).request('/api/stream/containers/abc/logs?tail=10')

        expect(denied.status).toBe(401)
        expect((await denied.json()).error.code).toBe('AUTH_REQUIRED')
    })

    test('작업 목록을 인증된 계약으로 반환하고 미존재 작업은 404 를 반환합니다', async () => {
        const app = createApp(createAppTestDependencies())
        const [listResponse, missingResponse, scheduleResponse] = await Promise.all([
            app.request('/api/jobs?limit=10'),
            app.request('/api/jobs/2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2aa'),
            app.request('/api/jobs/backup-schedule'),
        ])

        expect(scheduleResponse.status).toBe(200)
        expect((await scheduleResponse.json()).data.intervalHours).toBe(24)

        expect(listResponse.status).toBe(200)
        expect((await listResponse.json()).data).toEqual([])
        expect(missingResponse.status).toBe(404)
        expect((await missingResponse.json()).error.code).toBe('JOB_NOT_FOUND')
    })

    test('maintenance 중 mutation 은 503 으로 차단하고 해제 경로와 조회는 허용합니다', async () => {
        const dependencies = createAppTestDependencies()
        const normalApp = createApp(dependencies)
        const statusResponse = await normalApp.request('/api/maintenance')
        expect(statusResponse.status).toBe(200)
        expect((await statusResponse.json()).data.enabled).toBe(false)

        const maintenanceApp = createApp({
            ...dependencies,
            maintenanceService: { ...dependencies.maintenanceService, isEnabled: () => true },
        })
        const blocked = await maintenanceApp.request('/api/backups', {
            body: JSON.stringify({ label: null }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })
        expect(blocked.status).toBe(503)
        expect((await blocked.json()).error.code).toBe('MAINTENANCE_MODE')
        expect(blocked.headers.get('retry-after')).toBe('30')

        const exempt = await maintenanceApp.request('/api/maintenance', {
            body: JSON.stringify({ enabled: false }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })
        expect(exempt.status).not.toBe(503)

        const readAllowed = await maintenanceApp.request('/api/jobs?limit=1')
        expect(readAllowed.status).toBe(200)
    })

    test('control plane 상태는 owner·admin 만 200 으로 조회하고 다른 역할은 403 입니다', async () => {
        const dependencies = createAppTestDependencies()
        const roleChecks: string[][] = []
        const ownerApp = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async (_headers: Headers, roles: string[]) => {
                    roleChecks.push(roles)
                    return dependencies.authService.requireRole()
                },
            },
        })
        const ownerResponse = await ownerApp.request('/api/control-plane/status')
        expect(ownerResponse.status).toBe(200)
        expect((await ownerResponse.json()).data).toMatchObject({ version: '0.1.0', migrations: { applied: [], pending: [] } })
        expect(roleChecks).toEqual([['owner', 'admin']])

        const forbiddenApp = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async () => {
                    throw createAppError('FORBIDDEN')
                },
            },
        })
        const forbiddenResponse = await forbiddenApp.request('/api/control-plane/status')
        expect(forbiddenResponse.status).toBe(403)
        expect((await forbiddenResponse.json()).error.code).toBe('FORBIDDEN')
    })

    test('공개 email 가입 경로를 차단합니다', async () => {
        const response = await createApp(createAppTestDependencies()).request('/api/auth/sign-up/email', { method: 'POST' })
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body.error.code).toBe('SIGN_UP_DISABLED')
    })

    test('동일 원본의 반복 로그인 요청을 application 경계에서도 제한합니다', async () => {
        const app = createApp(createAppTestDependencies())
        const request = () =>
            app.request('/api/auth/sign-in/email', {
                body: JSON.stringify({ email: 'owner@example.com', password: 'invalid-password' }),
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
                method: 'POST',
            })

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect((await request()).status).toBe(404)
        }
        const limited = await request()
        expect(limited.status).toBe(429)
        expect(limited.headers.get('retry-after')).toBe('60')
        expect((await limited.json()).error.code).toBe('AUTH_RATE_LIMITED')
    })

    test('Docker 변경 API는 인증되지 않은 요청을 거부합니다', async () => {
        const dependencies = createAppTestDependencies()
        const response = await createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRole: async () => {
                    throw createAppError('AUTH_REQUIRED')
                },
            },
        }).request('/api/containers/container-id/actions', {
            body: JSON.stringify({ action: 'start' }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        })
        const body = await response.json()

        expect(response.status).toBe(401)
        expect(body.error.code).toBe('AUTH_REQUIRED')
    })

    test('owner 전용 scope 의 API 키 발급은 admin 세션을 거부합니다', async () => {
        const dependencies = createAppTestDependencies()
        const requestedRoles: string[][] = []
        const app = createApp({
            ...dependencies,
            apiKeyService: {
                ...dependencies.apiKeyService,
                create: async () => ({
                    createdAt: '2026-08-01T00:00:00.000Z',
                    expiresAt: null,
                    id: '2b1f8a49-4a1f-4be1-9f14-1b6a9be3f2ad',
                    lastUsedAt: null,
                    name: 'automation',
                    prefix: 'ctk_test',
                    revokedAt: null,
                    scopes: ['artifact:upload' as const],
                    token: 'ctk_test_token',
                }),
            },
            authService: {
                ...dependencies.authService,
                requireRecentRole: async (_headers: Headers, allowedRoles: string[]) => {
                    requestedRoles.push(allowedRoles)
                    if (!allowedRoles.includes('admin')) {
                        throw createAppError('FORBIDDEN')
                    }
                    return dependencies.authService.requireRole()
                },
            },
        })
        const post = (scopes: string[]) =>
            app.request('/api/api-keys', {
                body: JSON.stringify({ expiresInDays: 30, name: 'automation', scopes }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })

        expect((await post(['artifact:upload'])).status).toBe(201)
        expect((await post(['backup:write'])).status).toBe(403)
        expect((await post(['secret:write'])).status).toBe(403)
        expect(requestedRoles).toEqual([['owner', 'admin'], ['owner'], ['owner']])
    })

    test('백업 복원은 API key 경로를 거부하고 세션만 허용합니다', async () => {
        const dependencies = createAppTestDependencies()
        const backupId = '374f1798-c75f-4152-938d-be2d09d12d51'
        const app = createApp({
            ...dependencies,
            authService: {
                ...dependencies.authService,
                requireRecentRole: async () => dependencies.authService.requireRole(),
            },
            operationJobService: {
                ...dependencies.operationJobService,
                enqueue: async (input) => ({ ...createQueuedJob('backup.restore', backupId), payload: input.payload }),
            },
        })
        const restore = (headers: Record<string, string>) =>
            app.request(`/api/backups/${backupId}/restore`, {
                body: JSON.stringify({ confirmation: backupId }),
                headers: { 'content-type': 'application/json', ...headers },
                method: 'POST',
            })

        const denied = await restore({ authorization: 'Bearer ctk_test' })
        expect(denied.status).toBe(403)
        expect((await denied.json()).error.code).toBe('FORBIDDEN')
        expect((await restore({})).status).toBe(202)
    })
})
