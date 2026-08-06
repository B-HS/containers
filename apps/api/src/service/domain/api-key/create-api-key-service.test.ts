import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { createControlDatabase } from '@containers/db-schema/database'
import { USER_ROLE, user, userRole } from '@containers/db-schema/schema'
import { buildApiKeyServiceDb } from '../../../compose/compose-api-key'
import { createApiKeyService } from './create-api-key-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestService = async (role: string = USER_ROLE.OWNER) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-api-key-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const now = new Date('2026-07-31T00:00:00.000Z')
    const actorId = 'test-owner'
    await database.db.insert(user).values({
        createdAt: now,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: now,
    })
    await database.db.insert(userRole).values({
        createdAt: now,
        role: role as typeof USER_ROLE.OWNER,
        updatedAt: now,
        userId: actorId,
    })

    return { ...database, actor: { id: actorId, role }, service: createApiKeyService({ db: buildApiKeyServiceDb(database.db), now: () => now }) }
}

describe('API 키 서비스', () => {
    test('원문은 한 번만 반환하고 hash로 인증합니다', async () => {
        const { actor, service, sqlite } = await createTestService()
        const result = await service.create(actor, {
            expiresInDays: 30,
            name: 'Deployment automation',
            scopes: [API_KEY_SCOPE.ARTIFACT_UPLOAD, API_KEY_SCOPE.IMAGE_LOAD],
        })
        const principal = await service.authenticate(new Headers({ authorization: `Bearer ${result.token}` }), API_KEY_SCOPE.ARTIFACT_UPLOAD)
        const [listed] = await service.list()

        expect(principal.actorId).toBe(actor.id)
        expect(principal.authMethod).toBe('api-key')
        expect(listed).not.toHaveProperty('token')
        await expect(service.authenticate(new Headers({ authorization: `Bearer ${result.token}` }), API_KEY_SCOPE.ARTIFACT_READ)).rejects.toThrow(
            'FORBIDDEN',
        )
        await service.revoke(result.id)
        await expect(service.authenticate(new Headers({ authorization: `Bearer ${result.token}` }), API_KEY_SCOPE.ARTIFACT_UPLOAD)).rejects.toThrow(
            'AUTH_REQUIRED',
        )
        sqlite.close()
    })

    test('API key별 minute rate limit을 적용합니다', async () => {
        const { actor, db, sqlite } = await createTestService()
        const service = createApiKeyService({ db: buildApiKeyServiceDb(db), now: () => new Date('2026-07-31T00:00:00.000Z'), rateLimitPerMinute: 2 })
        const result = await service.create(actor, {
            expiresInDays: 30,
            name: 'Rate limited automation',
            scopes: [API_KEY_SCOPE.ARTIFACT_READ],
        })
        const headers = new Headers({ authorization: `Bearer ${result.token}` })

        await service.authenticate(headers, API_KEY_SCOPE.ARTIFACT_READ)
        await service.authenticate(headers, API_KEY_SCOPE.ARTIFACT_READ)
        await expect(service.authenticate(headers, API_KEY_SCOPE.ARTIFACT_READ)).rejects.toThrow('API_KEY_RATE_LIMITED')
        sqlite.close()
    })

    test('admin 은 owner 전용 scope 의 키를 발급하지 못합니다', async () => {
        const { actor, service, sqlite } = await createTestService(USER_ROLE.ADMIN)

        await expect(service.create(actor, { expiresInDays: 30, name: 'Backup automation', scopes: [API_KEY_SCOPE.BACKUP_WRITE] })).rejects.toThrow(
            'FORBIDDEN',
        )
        await expect(service.create(actor, { expiresInDays: 30, name: 'Secret automation', scopes: [API_KEY_SCOPE.SECRET_WRITE] })).rejects.toThrow(
            'FORBIDDEN',
        )
        expect(await service.list()).toHaveLength(0)
        sqlite.close()
    })

    test('owner 전용 scope 는 발급자의 현재 role 이 owner 일 때만 인증됩니다', async () => {
        const { actor, db, service, sqlite } = await createTestService()
        const result = await service.create(actor, {
            expiresInDays: 30,
            name: 'Backup automation',
            scopes: [API_KEY_SCOPE.BACKUP_WRITE, API_KEY_SCOPE.BACKUP_READ],
        })
        const headers = new Headers({ authorization: `Bearer ${result.token}` })

        expect((await service.authenticate(headers, API_KEY_SCOPE.BACKUP_WRITE)).apiKeyId).toBe(result.id)

        await db.update(userRole).set({ role: USER_ROLE.ADMIN }).where(eq(userRole.userId, actor.id))

        await expect(service.authenticate(headers, API_KEY_SCOPE.BACKUP_WRITE)).rejects.toThrow('FORBIDDEN')
        expect((await service.authenticate(headers, API_KEY_SCOPE.BACKUP_READ)).apiKeyId).toBe(result.id)
        sqlite.close()
    })

    test('만료 없는 키와 상한을 넘는 키는 만들 수 없습니다', async () => {
        const { actor, service, sqlite } = await createTestService()

        await expect(service.create(actor, { expiresInDays: null, name: 'forever', scopes: [API_KEY_SCOPE.DEPLOYMENT_READ] })).rejects.toThrow()
        await expect(service.create(actor, { expiresInDays: 366, name: 'too long', scopes: [API_KEY_SCOPE.DEPLOYMENT_READ] })).rejects.toThrow()
        sqlite.close()
    })
})
