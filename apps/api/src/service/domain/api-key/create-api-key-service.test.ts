import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { createControlDatabase } from '@containers/db-schema/database'
import { user } from '@containers/db-schema/schema'
import { createApiKeyService } from './create-api-key-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestService = async () => {
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

    return { ...database, actorId, service: createApiKeyService({ db: database.db, now: () => now }) }
}

describe('API 키 서비스', () => {
    test('원문은 한 번만 반환하고 hash로 인증합니다', async () => {
        const { actorId, service, sqlite } = await createTestService()
        const result = await service.create(actorId, {
            expiresInDays: 30,
            name: 'Deployment automation',
            scopes: [API_KEY_SCOPE.ARTIFACT_UPLOAD, API_KEY_SCOPE.IMAGE_LOAD],
        })
        const principal = await service.authenticate(new Headers({ authorization: `Bearer ${result.token}` }), API_KEY_SCOPE.ARTIFACT_UPLOAD)
        const [listed] = await service.list()

        expect(principal.actorId).toBe(actorId)
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
        const { actorId, db, sqlite } = await createTestService()
        const service = createApiKeyService({ db, now: () => new Date('2026-07-31T00:00:00.000Z'), rateLimitPerMinute: 2 })
        const result = await service.create(actorId, {
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
})
