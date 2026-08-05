import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { deploymentSecret, user } from '@containers/db-schema/schema'
import { buildDeploymentManifestServiceDb } from '../../../compose/compose-deployment-manifest'
import { buildDeploymentSecretServiceDb } from '../../../compose/compose-deployment-secret'
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
        db: buildDeploymentSecretServiceDb(database.db),
        keyring: { activeVersion: 1, keys: new Map([[1, 'test-master-secret-that-is-longer-than-thirty-two-characters']]) },
        now: () => timestamp,
    })
    const manifestService = createDeploymentManifestService({
        db: buildDeploymentManifestServiceDb(database.db),
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
        protectedHostnames: () => [],
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
    test('키 교체 후 기존 secret 을 새 키 버전으로 재암호화하고 값은 그대로 읽습니다', async () => {
        const { actorId, db, secretService, sqlite } = await createTestContext()
        await secretService.upsert(actorId, { reference: 'apps/sample/token', value: 'plain-token-value' })
        const before = await db.select().from(deploymentSecret).where(eq(deploymentSecret.reference, 'apps/sample/token'))

        const rotated = await secretService.rotate({
            activeVersion: 2,
            keys: new Map([
                [1, 'test-master-secret-that-is-longer-than-thirty-two-characters'],
                [2, 'second-master-secret-that-is-longer-than-thirty-two-chars'],
            ]),
        })
        const after = await db.select().from(deploymentSecret).where(eq(deploymentSecret.reference, 'apps/sample/token'))

        expect(rotated).toEqual({ keyVersion: 2, rotatedCount: 1 })
        expect(before[0]?.keyVersion).toBe(1)
        expect(after[0]?.keyVersion).toBe(2)
        expect(after[0]?.ciphertext).not.toBe(before[0]?.ciphertext)
        expect(await secretService.resolve([{ environmentKey: 'TOKEN', reference: 'apps/sample/token' }])).toEqual(['TOKEN=plain-token-value'])
        sqlite.close()
    })

    test('행의 키 버전이 keyring 에 없으면 복호화를 거부합니다', async () => {
        const { actorId, db, secretService, sqlite } = await createTestContext()
        await secretService.upsert(actorId, { reference: 'apps/sample/orphan', value: 'orphan-value' })
        await db.update(deploymentSecret).set({ keyVersion: 7 }).where(eq(deploymentSecret.reference, 'apps/sample/orphan'))

        await expect(secretService.resolve([{ environmentKey: 'TOKEN', reference: 'apps/sample/orphan' }])).rejects.toThrow(
            'DEPLOYMENT_SECRET_DECRYPTION_FAILED',
        )
        sqlite.close()
    })
})
