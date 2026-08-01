import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { containerActionSchema, containerCreateRequestSchema, containerNetworkAttachmentSchema } from '@containers/contracts/engine-control'
import { createControlDatabase } from '@containers/db-schema/database'
import { deploymentRelease, user } from '@containers/db-schema/schema'
import { eq } from 'drizzle-orm'
import { createDeploymentManifestService } from './create-deployment-manifest-service'
import { createDeploymentReleaseService } from './create-deployment-release-service'

const temporaryDirectories: string[] = []
const imageDigest = `sha256:${'c'.repeat(64)}`

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async ({
    health = true,
    manifestSecrets = [],
    resolvedEnvironment = [],
    routeProbes = [true, true],
}: {
    health?: boolean
    manifestSecrets?: Array<{ environmentKey: string; reference: string }>
    resolvedEnvironment?: string[]
    routeProbes?: boolean[]
} = {}) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deployment-release-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const timestamp = new Date('2026-08-01T00:00:00.000Z')
    const actorId = 'test-owner'
    await database.db.insert(user).values({
        createdAt: timestamp,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: timestamp,
    })
    const manifestService = createDeploymentManifestService({
        db: database.db,
        engineAgentClient: {
            getImages: async () => [
                {
                    createdAt: timestamp.toISOString(),
                    id: imageDigest,
                    repoDigests: [],
                    repoTags: [],
                    sharedSizeBytes: 0,
                    sizeBytes: 1,
                },
            ],
        },
        now: () => timestamp,
        protectedHostnames: [],
        protectedNetworks: ['containers_control'],
    })
    const manifest = await manifestService.create(actorId, {
        healthcheck: { path: '/health', retries: 2, startPeriodSeconds: 0 },
        imageDigest,
        internalPort: 3000,
        name: 'sample-app',
        rollout: { observationSeconds: 10, rollbackRetentionSeconds: 60 },
        route: { hostname: 'sample.example.com' },
        secrets: manifestSecrets,
        version: '1.0.0',
    })
    const operations: string[] = []
    const createdEnvironments: string[][] = []
    let routeProbeIndex = 0
    const releaseService = createDeploymentReleaseService({
        controlNetwork: 'containers_control',
        db: database.db,
        deploymentManifestService: manifestService,
        deploymentSecretService: { resolve: async () => resolvedEnvironment },
        engineAgentClient: {
            connectContainerNetwork: async (_containerId, input) => {
                const attachment = containerNetworkAttachmentSchema.parse(input)
                operations.push(attachment.network === 'containers_control' ? 'connect-control' : 'connect-edge')
                return { operation: 'connect-network', targetId: 'new-container-id' }
            },
            createContainer: async (input) => {
                operations.push('create')
                createdEnvironments.push(containerCreateRequestSchema.parse(input).environment)
                return { operation: 'create-container', targetId: 'new-container-id' }
            },
            disconnectContainerNetwork: async (_containerId, input) => {
                const attachment = containerNetworkAttachmentSchema.parse(input)
                operations.push(attachment.network === 'containers_control' ? 'disconnect-control' : 'disconnect-network')
                return { operation: 'disconnect-network', targetId: 'new-container-id' }
            },
            performContainerAction: async (_containerId, action) => {
                const parsedAction = containerActionSchema.parse(action)
                operations.push(parsedAction.action)
                return { operation: parsedAction.action, targetId: 'new-container-id' }
            },
            probeContainer: async () => ({ error: health ? null : 'HTTP_503', healthy: health, latencyMs: 1, statusCode: health ? 200 : 503 }),
        },
        nginxProxyRouteService: {
            list: async () => [],
            remove: async () => {
                operations.push('remove-route')
                return {
                    configSha256: 'd'.repeat(64),
                    route: {
                        bodySizeMegabytes: 64,
                        createdAt: timestamp.toISOString(),
                        enabled: true,
                        hostname: 'sample.example.com',
                        id: '01958c26-65b5-7c22-9254-03b914e61cc7',
                        path: '/',
                        pathMode: 'prefix' as const,
                        protocol: 'http' as const,
                        stripPrefix: false,
                        targetContainer: 'new-container',
                        targetPort: 3000,
                        timeoutSeconds: 60,
                        updatedAt: timestamp.toISOString(),
                    },
                }
            },
            upsert: async (input: unknown) => {
                operations.push('switch-route')
                const route = input as { targetContainer: string }
                return {
                    configSha256: 'd'.repeat(64),
                    route: {
                        bodySizeMegabytes: 64,
                        createdAt: timestamp.toISOString(),
                        enabled: true,
                        hostname: 'sample.example.com',
                        id: '01958c26-65b5-7c22-9254-03b914e61cc7',
                        path: '/',
                        pathMode: 'prefix' as const,
                        protocol: 'http' as const,
                        stripPrefix: false,
                        targetContainer: route.targetContainer,
                        targetPort: 3000,
                        timeoutSeconds: 60,
                        updatedAt: timestamp.toISOString(),
                    },
                }
            },
        },
        now: () => timestamp,
        routeProbe: async () => routeProbes[routeProbeIndex++] ?? false,
        sleep: async () => undefined,
    })

    return { ...database, actorId, createdEnvironments, manifest, manifestService, operations, releaseService }
}

describe('blue-green deployment release', () => {
    test('control network health 후 edge 연결, route 전환, observation을 거쳐 healthy가 됩니다', async () => {
        const { actorId, manifest, operations, releaseService, sqlite } = await createTestContext()
        const release = await releaseService.create(actorId, manifest.id)
        const result = await releaseService.run(release.id)

        expect(result.status).toBe('healthy')
        expect(result.containerId).toBe('new-container-id')
        expect(operations).toEqual(['create', 'connect-edge', 'disconnect-control', 'switch-route'])
        sqlite.close()
    })

    test('route observation 실패 시 신규 route를 제거하고 신규 container를 중지합니다', async () => {
        const { actorId, manifest, operations, releaseService, sqlite } = await createTestContext({ routeProbes: [true, false] })
        const release = await releaseService.create(actorId, manifest.id)
        const result = await releaseService.run(release.id)

        expect(result.status).toBe('rolled-back')
        expect(result.failureCode).toBe('DEPLOYMENT_OBSERVATION_FAILED')
        expect(operations).toEqual(['create', 'connect-edge', 'disconnect-control', 'switch-route', 'remove-route', 'stop'])
        sqlite.close()
    })

    test('Nginx reload 직후 이전 worker 응답은 retry하고 새 route 준비 후 observation합니다', async () => {
        const { actorId, manifest, operations, releaseService, sqlite } = await createTestContext({ routeProbes: [false, true, true] })
        const release = await releaseService.create(actorId, manifest.id)
        const result = await releaseService.run(release.id)

        expect(result.status).toBe('healthy')
        expect(operations).toEqual(['create', 'connect-edge', 'disconnect-control', 'switch-route'])
        sqlite.close()
    })

    test('container health 실패 시 공개 route를 변경하지 않고 신규 container만 중지합니다', async () => {
        const { actorId, manifest, operations, releaseService, sqlite } = await createTestContext({ health: false })
        const release = await releaseService.create(actorId, manifest.id)
        const result = await releaseService.run(release.id)

        expect(result.status).toBe('failed')
        expect(result.failureCode).toBe('DEPLOYMENT_HEALTHCHECK_FAILED')
        expect(operations).toEqual(['create', 'stop'])
        sqlite.close()
    })

    test('암호화 저장소에서 해석한 secret만 Docker environment로 전달합니다', async () => {
        const { actorId, createdEnvironments, manifest, releaseService, sqlite } = await createTestContext({
            manifestSecrets: [{ environmentKey: 'TOKEN', reference: 'apps/sample/token' }],
            resolvedEnvironment: ['TOKEN=resolved-value'],
        })
        const release = await releaseService.create(actorId, manifest.id)
        await releaseService.run(release.id)

        expect(createdEnvironments).toEqual([['TOKEN=resolved-value']])
        sqlite.close()
    })

    test('이전 healthy release를 다시 기동하고 검증한 뒤 수동 rollback합니다', async () => {
        const { actorId, manifest, manifestService, operations, releaseService, sqlite } = await createTestContext({
            routeProbes: [true, true, true, true, true],
        })
        const firstRelease = await releaseService.create(actorId, manifest.id)
        await releaseService.run(firstRelease.id)
        const secondManifest = await manifestService.create(actorId, {
            healthcheck: { path: '/health', retries: 2, startPeriodSeconds: 0 },
            imageDigest,
            internalPort: 3000,
            name: 'sample-app',
            rollout: { observationSeconds: 10, rollbackRetentionSeconds: 60 },
            route: { hostname: 'sample.example.com' },
            version: '2.0.0',
        })
        const secondRelease = await releaseService.create(actorId, secondManifest.id)
        await releaseService.run(secondRelease.id)

        const prepared = await releaseService.prepareRollback(secondRelease.id)
        const result = await releaseService.runRollback(secondRelease.id)

        expect(prepared.status).toBe('rolling-back')
        expect(result.status).toBe('rolled-back')
        expect(result.failureCode).toBe('MANUAL_ROLLBACK')
        expect(operations.slice(-5)).toEqual(['connect-control', 'start', 'switch-route', 'disconnect-control', 'stop'])
        sqlite.close()
    })

    test('프로세스 재시작 시 중단된 route 전환을 안전 상태로 수렴시킵니다', async () => {
        const { actorId, db, manifest, operations, releaseService, sqlite } = await createTestContext()
        const release = await releaseService.create(actorId, manifest.id)
        await db
            .update(deploymentRelease)
            .set({ containerId: 'interrupted-container', status: 'observing' })
            .where(eq(deploymentRelease.id, release.id))

        const [result] = await releaseService.reconcileInterrupted()

        expect(result?.status).toBe('rolled-back')
        expect(result?.failureCode).toBe('DEPLOYMENT_PROCESS_INTERRUPTED')
        expect(operations).toEqual(['stop'])
        sqlite.close()
    })

    test('rollback 보존 시간이 지난 이전 컨테이너를 volume 없이 정리합니다', async () => {
        const { actorId, db, manifest, manifestService, operations, releaseService, sqlite } = await createTestContext({
            routeProbes: [true, true, true, true],
        })
        const firstRelease = await releaseService.create(actorId, manifest.id)
        await releaseService.run(firstRelease.id)
        const secondManifest = await manifestService.create(actorId, {
            healthcheck: { path: '/health', retries: 2, startPeriodSeconds: 0 },
            imageDigest,
            internalPort: 3000,
            name: 'sample-app',
            rollout: { observationSeconds: 10, rollbackRetentionSeconds: 60 },
            route: { hostname: 'sample.example.com' },
            version: '2.0.0',
        })
        const secondRelease = await releaseService.create(actorId, secondManifest.id)
        await releaseService.run(secondRelease.id)
        await db
            .update(deploymentRelease)
            .set({ activatedAt: new Date('2026-07-31T23:58:59.000Z') })
            .where(eq(deploymentRelease.id, secondRelease.id))

        const removed = await releaseService.cleanupExpiredContainers()
        const retainedRelease = await releaseService.get(firstRelease.id)

        expect(removed).toBe(1)
        expect(retainedRelease.containerId).toBeNull()
        expect(operations.at(-1)).toBe('remove')
        sqlite.close()
    })
})
