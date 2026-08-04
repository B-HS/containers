import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment, user } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/error'
import { createDeploymentService } from './create-deployment-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (shouldFail = false) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deployment-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const createdAt = new Date('2026-07-31T00:00:00.000Z')
    const actorId = 'test-owner'
    const artifactId = '01958c26-65b5-7c22-9254-03b914e61cc5'
    await database.db.insert(user).values({
        createdAt,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: createdAt,
    })
    await database.db.insert(artifact).values({
        createdAt,
        createdBy: actorId,
        fileName: 'image.tar',
        id: artifactId,
        mediaType: 'application/vnd.docker.image.rootfs.diff.tar',
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
        status: 'ready',
        storagePath: `/artifacts/ready/${artifactId}.archive`,
    })
    const service = createDeploymentService({
        db: database.db,
        engineAgentClient: {
            loadImage: async () => {
                if (shouldFail) {
                    throw createAppError('ENGINE_LOAD_FAILED')
                }
                return { messages: ['Loaded image: example:latest'], operation: 'load-image', targetId: artifactId }
            },
        },
        now: () => createdAt,
    })

    return { ...database, actorId, artifactId, service }
}

describe('배포 서비스 image load', () => {
    test('ready artifact를 Agent로 전달하고 loaded 상태를 저장합니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext()
        const result = await service.loadArtifact(artifactId, actorId)
        const [record] = await db.select().from(deployment).where(eq(deployment.id, result.id))

        expect(result.status).toBe('loaded')
        expect(record?.status).toBe('loaded')
        sqlite.close()
    })

    test('Engine 실패를 deployment failure로 남깁니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext(true)

        await expect(service.loadArtifact(artifactId, actorId)).rejects.toThrow('ENGINE_LOAD_FAILED')
        const [record] = await db.select().from(deployment)
        expect(record?.status).toBe('failed')
        sqlite.close()
    })

    test('기존 loaded 행을 재사용하고 getLoaded는 그 행을 돌려줍니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext()
        const first = await service.loadArtifact(artifactId, actorId)
        const second = await service.loadArtifact(artifactId, actorId)

        expect(second.id).toBe(first.id)
        expect(second.status).toBe('loaded')
        const [count] = await db.select({ value: sql`count(*)` }).from(deployment)
        expect(count?.value).toBe(1)
        expect((await service.getLoaded(artifactId))?.id).toBe(first.id)
        sqlite.close()
    })

    test('loading 행을 이어서 loaded로 갱신합니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext()
        const createdAt = new Date('2026-07-31T00:00:00.000Z')
        await db.insert(deployment).values({
            artifactId,
            createdAt,
            createdBy: actorId,
            id: '01958c26-65b5-7c22-9254-03b914e61cc6',
            status: 'loading',
            updatedAt: createdAt,
        })

        const result = await service.loadArtifact(artifactId, actorId)
        expect(result.status).toBe('loaded')
        expect(result.id).toBe('01958c26-65b5-7c22-9254-03b914e61cc6')
        const [count] = await db.select({ value: sql`count(*)` }).from(deployment)
        expect(count?.value).toBe(1)
        sqlite.close()
    })

    test('오래된 loaded와 최신 failed가 공존하면 loaded 행을 재로드 없이 돌려줍니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext(true)
        const loadedId = '01958c26-65b5-7c22-9254-03b914e61cc7'
        const failedId = '01958c26-65b5-7c22-9254-03b914e61cc8'
        const loadedCreatedAt = new Date('2026-07-30T00:00:00.000Z')
        const failedCreatedAt = new Date('2026-07-31T00:00:00.000Z')
        await db.insert(deployment).values([
            { artifactId, createdAt: loadedCreatedAt, createdBy: actorId, id: loadedId, status: 'loaded', updatedAt: loadedCreatedAt },
            { artifactId, createdAt: failedCreatedAt, createdBy: actorId, id: failedId, status: 'failed', updatedAt: failedCreatedAt },
        ])

        const result = await service.loadArtifact(artifactId, actorId)

        expect(result.id).toBe(loadedId)
        expect(result.status).toBe('loaded')
        const [failedRecord] = await db.select().from(deployment).where(eq(deployment.id, failedId))
        expect(failedRecord?.status).toBe('failed')
        sqlite.close()
    })

    test('ready가 아닌 artifact는 getLoaded와 loadArtifact 모두 거부합니다', async () => {
        const { actorId, artifactId, db, sqlite } = await createTestContext()
        const service = createDeploymentService({
            db,
            engineAgentClient: {
                loadImage: async () => ({ messages: [], operation: 'load-image', targetId: artifactId }),
            },
            now: () => new Date('2026-07-31T00:00:00.000Z'),
        })
        await db.update(artifact).set({ status: 'quarantined' }).where(eq(artifact.id, artifactId))

        await expect(service.getLoaded(artifactId)).rejects.toThrow('ARTIFACT_NOT_READY')
        await expect(service.loadArtifact(artifactId, actorId)).rejects.toThrow('ARTIFACT_NOT_READY')
        sqlite.close()
    })
})
