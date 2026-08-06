import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, deploymentStack, deploymentStackRelease, user } from '@containers/db-schema/schema'
import { buildDeploymentStackServiceDb } from '../../../compose/compose-deployment-stack'
import { createDeploymentStackService } from './create-deployment-stack-service'

const temporaryDirectories: string[] = []
const appDigest = `sha256:${'a'.repeat(64)}`
const databaseDigest = `sha256:${'b'.repeat(64)}`

const COMPOSE = `
services:
  app:
    image: app:1.0.0
    depends_on: [db]
    expose: ["8080"]
    ports:
      - "18080:8080"
    labels:
      containers.route.hostname: shop.example.com
  db:
    image: db:16
    expose: ["5432"]
`

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deployment-stack-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const timestamp = new Date('2026-08-06T00:00:00.000Z')
    const actorId = 'test-owner'
    await database.db.insert(user).values({
        createdAt: timestamp,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: timestamp,
    })
    const imageCalls = { count: 0 }
    const service = createDeploymentStackService({
        db: buildDeploymentStackServiceDb(database.db),
        engineAgentClient: {
            getImages: async () => {
                imageCalls.count += 1
                return [
                    { createdAt: timestamp.toISOString(), id: appDigest, repoDigests: [], repoTags: ['app:1.0.0'], sharedSizeBytes: 0, sizeBytes: 1 },
                    {
                        createdAt: timestamp.toISOString(),
                        id: databaseDigest,
                        repoDigests: [],
                        repoTags: ['db:16'],
                        sharedSizeBytes: 0,
                        sizeBytes: 1,
                    },
                ]
            },
        },
        now: () => timestamp,
        protectedHostnames: () => ['panel.example.com'],
        protectedNetworks: ['containers_control', 'containers_ingress'],
    })

    return { ...database, actorId, imageCalls, service }
}

const createInput = (overrides: Record<string, unknown> = {}) => ({ compose: COMPOSE, name: 'shop', version: '1.0.0', ...overrides })

describe('compose 스택 서비스', () => {
    test('미리보기는 저장하지 않고 manifest 와 무시 목록을 돌려준다', async () => {
        const { db, imageCalls, service, sqlite } = await createTestContext()
        const preview = await service.preview(createInput())

        expect(preview.order).toEqual(['db', 'app'])
        expect(preview.services.map((plan) => plan.manifest.name)).toEqual(['shop-db', 'shop-app'])
        expect(preview.services[0]?.manifest.imageDigest).toBe(databaseDigest)
        expect(preview.services[1]?.manifest.route?.hostname).toBe('shop.example.com')
        expect(preview.ignored).toEqual([{ key: 'ports', reason: expect.any(String), service: 'app' }])
        expect(imageCalls.count).toBe(1)
        expect(await db.select().from(deploymentManifest)).toHaveLength(0)
        expect(await db.select().from(deploymentStack)).toHaveLength(0)
        sqlite.close()
    })

    test('스택 1건과 manifest 2건을 한 번에 저장한다', async () => {
        const { actorId, db, imageCalls, service, sqlite } = await createTestContext()
        const stack = await service.create(actorId, createInput())
        const manifests = await db.select().from(deploymentManifest)

        expect(stack.serviceOrder).toEqual(['db', 'app'])
        expect(stack.manifestIds).toHaveLength(2)
        expect(manifests.map((manifest) => manifest.name).sort()).toEqual(['shop-app', 'shop-db'])
        expect(stack.manifestIds).toEqual(['db', 'app'].map((service) => manifests.find((manifest) => manifest.name === `shop-${service}`)?.id ?? ''))
        expect(manifests.find((manifest) => manifest.name === 'shop-db')?.routeHostname).toBeNull()
        expect(imageCalls.count).toBe(1)
        expect((await service.get(stack.id)).name).toBe('shop')
        expect(await service.list()).toHaveLength(1)
        sqlite.close()
    })

    test('같은 이름과 버전의 스택은 거부한다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        await service.create(actorId, createInput())

        await expect(service.create(actorId, createInput())).rejects.toThrow('DEPLOYMENT_STACK_VERSION_EXISTS')
        sqlite.close()
    })

    test('같은 이름과 버전의 manifest 가 이미 있으면 거부한다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        await service.create(actorId, createInput())
        await db.delete(deploymentStack)

        await expect(service.create(actorId, createInput())).rejects.toThrow('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
        sqlite.close()
    })

    test('보호 hostname 을 요구하는 compose 는 미리보기에서 거부한다', async () => {
        const { service, sqlite } = await createTestContext()

        await expect(service.preview(createInput({ compose: COMPOSE.replace('shop.example.com', 'panel.example.com') }))).rejects.toThrow(
            'DEPLOYMENT_ROUTE_PROTECTED_HOSTNAME',
        )
        sqlite.close()
    })

    test('저장 실패는 스택도 manifest 도 남기지 않는다', async () => {
        const { db, service, sqlite } = await createTestContext()

        await expect(service.create('missing-user', createInput())).rejects.toThrow('DEPLOYMENT_STACK_CREATE_FAILED')
        expect(await db.select().from(deploymentManifest)).toHaveLength(0)
        expect(await db.select().from(deploymentStack)).toHaveLength(0)
        sqlite.close()
    })

    test('스택을 삭제하면 릴리스 이력까지 지운다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const stack = await service.create(actorId, createInput())
        const timestamp = new Date('2026-08-06T00:00:00.000Z')
        await db.insert(deploymentStackRelease).values({
            createdAt: timestamp,
            createdBy: actorId,
            id: '11111111-1111-4111-8111-111111111111',
            releaseIdsJson: '[]',
            stackId: stack.id,
            status: 'healthy',
            updatedAt: timestamp,
        })

        await service.remove(stack.id)

        expect(await db.select().from(deploymentStack)).toHaveLength(0)
        expect(await db.select().from(deploymentStackRelease)).toHaveLength(0)
        sqlite.close()
    })

    test('진행 중인 릴리스가 있으면 스택을 삭제하지 않는다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const stack = await service.create(actorId, createInput())
        const timestamp = new Date('2026-08-06T00:00:00.000Z')
        await db.insert(deploymentStackRelease).values({
            createdAt: timestamp,
            createdBy: actorId,
            id: '22222222-2222-4222-8222-222222222222',
            releaseIdsJson: '[]',
            stackId: stack.id,
            status: 'releasing',
            updatedAt: timestamp,
        })

        await expect(service.remove(stack.id)).rejects.toThrow('DEPLOYMENT_STACK_IN_USE')
        expect(await db.select().from(deploymentStack)).toHaveLength(1)
        sqlite.close()
    })
})
