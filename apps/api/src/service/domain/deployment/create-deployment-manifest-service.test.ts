import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, user } from '@containers/db-schema/schema'
import { buildDeploymentManifestServiceDb } from '../../../compose/compose-deployment-manifest'
import { createDeploymentManifestService } from './create-deployment-manifest-service'

const temporaryDirectories: string[] = []
const imageDigest = `sha256:${'a'.repeat(64)}`

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deployment-manifest-'))
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
    const service = createDeploymentManifestService({
        db: buildDeploymentManifestServiceDb(database.db),
        engineAgentClient: {
            getImages: async () => [
                {
                    createdAt: timestamp.toISOString(),
                    id: imageDigest,
                    repoDigests: [`example@${imageDigest}`],
                    repoTags: ['example:1.0.0'],
                    sharedSizeBytes: 0,
                    sizeBytes: 1,
                },
            ],
        },
        now: () => timestamp,
        protectedHostnames: () => ['panel.example.com', 'api.example.com'],
        protectedNetworks: ['containers_control', 'containers_ingress'],
    })

    return { ...database, actorId, service }
}

const createInput = (overrides: Record<string, unknown> = {}) => ({
    healthcheck: { path: '/health' },
    imageDigest,
    internalPort: 3000,
    name: 'sample-app',
    rollout: {},
    route: { hostname: 'sample.example.com' },
    secrets: [{ environmentKey: 'DATABASE_URL', reference: 'production/sample/database-url' }],
    version: '1.0.0',
    ...overrides,
})

describe('배포 manifest 서비스', () => {
    test('image digest를 확인하고 secret 값 없이 immutable manifest를 저장합니다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const { manifest: created, reused } = await service.create(actorId, createInput())
        const [stored] = await db.select().from(deploymentManifest)

        expect(reused).toBe(false)
        expect(created.imageDigest).toBe(imageDigest)
        expect(created.secrets).toEqual([{ environmentKey: 'DATABASE_URL', reference: 'production/sample/database-url' }])
        expect(stored?.secretsJson).not.toContain('secret-value')
        expect((await service.get(created.id)).version).toBe('1.0.0')
        expect(await service.list()).toHaveLength(1)
        sqlite.close()
    })

    test('같은 name·version 재요청은 payload가 같으면 기존 manifest를 재사용합니다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const first = await service.create(actorId, createInput())
        const second = await service.create(actorId, createInput())

        expect(second.reused).toBe(true)
        expect(second.manifest.id).toBe(first.manifest.id)
        expect(await db.select().from(deploymentManifest)).toHaveLength(1)
        sqlite.close()
    })

    test('name·version 조회 필터로 목록을 좁힙니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        await service.create(actorId, createInput())
        await service.create(actorId, createInput({ version: '1.1.0' }))

        expect(await service.list({ name: 'sample-app' })).toHaveLength(2)
        expect(await service.list({ name: 'sample-app', version: '1.1.0' })).toHaveLength(1)
        expect(await service.list({ name: 'other-app' })).toHaveLength(0)
        sqlite.close()
    })

    test('중복 version, 보호 hostname, 존재하지 않는 digest를 거부합니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        await service.create(actorId, createInput())

        await expect(service.create(actorId, createInput({ internalPort: 4000 }))).rejects.toThrow('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
        await expect(service.create(actorId, createInput({ route: { hostname: 'panel.example.com' }, version: '1.0.1' }))).rejects.toThrow(
            'DEPLOYMENT_ROUTE_PROTECTED_HOSTNAME',
        )
        await expect(service.create(actorId, createInput({ imageDigest: `sha256:${'b'.repeat(64)}`, version: '1.0.2' }))).rejects.toThrow(
            'DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND',
        )
        await expect(service.create(actorId, createInput({ route: { hostname: 'other.example.com' }, version: '1.0.3' }))).rejects.toThrow(
            'DEPLOYMENT_IDENTITY_MISMATCH',
        )
        sqlite.close()
    })
})
