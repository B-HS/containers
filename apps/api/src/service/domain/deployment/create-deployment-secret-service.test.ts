import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { deploymentSecret, user } from '@containers/db-schema/schema'
import { createDeploymentManifestService } from './create-deployment-manifest-service'
import { createDeploymentSecretService } from './create-deployment-secret-service'

const temporaryDirectories: string[] = []
const imageDigest = `sha256:${'e'.repeat(64)}`

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deployment-secret-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const timestamp = new Date('2026-08-01T00:00:00.000Z')
    const actorId = 'secret-owner'
    await database.db.insert(user).values({
        createdAt: timestamp,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: timestamp,
    })
    const secretService = createDeploymentSecretService({
        db: database.db,
        masterSecret: 'test-master-secret-that-is-longer-than-thirty-two-characters',
        now: () => timestamp,
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
        protectedNetworks: [],
    })
    return { ...database, actorId, manifestService, secretService }
}

describe('deployment secret service', () => {
    test('secret 값을 AES-GCM으로 암호화하고 metadata만 목록에 노출하며 rotation합니다', async () => {
        const { actorId, db, secretService, sqlite } = await createTestContext()
        const created = await secretService.upsert(actorId, { reference: 'apps/sample/token', value: 'sensitive-value' })
        const [stored] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.id, created.id))

        expect(stored?.ciphertext).not.toContain('sensitive-value')
        expect(await secretService.resolve([{ environmentKey: 'TOKEN', reference: 'apps/sample/token' }])).toEqual(['TOKEN=sensitive-value'])
        const rotated = await secretService.upsert(actorId, { reference: 'apps/sample/token', value: 'rotated-value' })
        expect(rotated.version).toBe(2)
        expect(await secretService.resolve([{ environmentKey: 'TOKEN', reference: 'apps/sample/token' }])).toEqual(['TOKEN=rotated-value'])
        expect(JSON.stringify(await secretService.list())).not.toContain('rotated-value')
        sqlite.close()
    })

    test('manifest에서 참조 중인 secret 삭제를 차단하고 미참조 secret만 삭제합니다', async () => {
        const { actorId, manifestService, secretService, sqlite } = await createTestContext()
        const used = await secretService.upsert(actorId, { reference: 'apps/sample/used', value: 'used-value' })
        const unused = await secretService.upsert(actorId, { reference: 'apps/sample/unused', value: 'unused-value' })
        await manifestService.create(actorId, {
            healthcheck: { path: '/' },
            imageDigest,
            internalPort: 3000,
            name: 'secret-app',
            rollout: { observationSeconds: 10, rollbackRetentionSeconds: 60 },
            route: { hostname: 'secret.example.com' },
            secrets: [{ environmentKey: 'TOKEN', reference: 'apps/sample/used' }],
            version: '1.0.0',
        })

        await expect(secretService.remove(used.id, { confirmation: used.reference })).rejects.toThrow('DEPLOYMENT_SECRET_IN_USE')
        expect((await secretService.remove(unused.id, { confirmation: unused.reference })).id).toBe(unused.id)
        sqlite.close()
    })
})
