import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment, user } from '@containers/db-schema/schema'
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
                    throw new Error('ENGINE_LOAD_FAILED')
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
        const result = await service.loadArtifact(actorId, artifactId)
        const [record] = await db.select().from(deployment).where(eq(deployment.id, result.id))

        expect(result.status).toBe('loaded')
        expect(record?.status).toBe('loaded')
        sqlite.close()
    })

    test('Engine 실패를 deployment failure로 남깁니다', async () => {
        const { actorId, artifactId, db, service, sqlite } = await createTestContext(true)

        await expect(service.loadArtifact(actorId, artifactId)).rejects.toThrow('ENGINE_LOAD_FAILED')
        const [record] = await db.select().from(deployment)
        expect(record?.status).toBe('failed')
        sqlite.close()
    })
})
