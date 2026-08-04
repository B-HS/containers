import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { notificationDestination, user } from '@containers/db-schema/schema'
import { buildNotificationDestinationServiceDb } from '../../../compose/compose-notification'
import { createNotificationDestinationService } from './create-notification-destination-service'

const temporaryDirectories: string[] = []
const webhookUrl = 'https://discord.com/api/webhooks/123/abc'

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-notification-destination-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const timestamp = new Date('2026-08-01T00:00:00.000Z')
    const actorId = 'notification-owner'
    await database.db.insert(user).values({
        createdAt: timestamp,
        email: 'owner@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Owner',
        updatedAt: timestamp,
    })
    const service = createNotificationDestinationService({
        db: buildNotificationDestinationServiceDb(database.db),
        keyring: { activeVersion: 1, keys: new Map([[1, 'test-master-secret-that-is-longer-than-thirty-two-characters']]) },
        now: () => timestamp,
    })
    return { ...database, actorId, service, timestamp }
}

const upsertInput = (overrides: Record<string, unknown> = {}) => ({
    enabled: true,
    eventTypes: ['backup.failed'],
    name: 'ops-discord',
    type: 'discord',
    webhookUrl,
    ...overrides,
})

describe('notification destination service', () => {
    test('webhook URL을 AES-GCM으로 암호화하고 metadata만 노출하며 rotation합니다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const created = await service.upsert(actorId, upsertInput())
        const [stored] = await db.select().from(notificationDestination).where(eq(notificationDestination.id, created.id))

        expect(JSON.stringify(created)).not.toContain('discord.com')
        expect(stored?.ciphertext).not.toContain('discord.com')
        expect(await service.resolveWebhook(created.id)).toEqual({ enabled: true, name: 'ops-discord', webhookUrl })
        const rotated = await service.upsert(actorId, upsertInput({ webhookUrl: 'https://discord.com/api/webhooks/456/def' }))
        expect(rotated.version).toBe(2)
        expect((await service.resolveWebhook(created.id)).webhookUrl).toBe('https://discord.com/api/webhooks/456/def')
        sqlite.close()
    })

    test('목록은 암호화된 값을 절대 노출하지 않고 lastDelivery 요약을 포함합니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        await service.upsert(actorId, upsertInput())

        const listed = await service.list()

        expect(listed).toHaveLength(1)
        expect(JSON.stringify(listed)).not.toContain('discord.com')
        expect(listed[0]).toMatchObject({
            enabled: true,
            eventTypes: ['backup.failed'],
            lastDelivery: { at: null, failureCode: null, status: null },
            name: 'ops-discord',
            type: 'discord',
            version: 1,
        })
        sqlite.close()
    })

    test('잘못된 master secret으로 해독 시 오류를 반환합니다', async () => {
        const { actorId, db, service, sqlite } = await createTestContext()
        const created = await service.upsert(actorId, upsertInput())
        const brokenService = createNotificationDestinationService({
            db: buildNotificationDestinationServiceDb(db),
            keyring: { activeVersion: 1, keys: new Map([[1, 'another-master-secret-that-is-longer-than-thirty-two']]) },
            now: () => new Date('2026-08-01T00:00:00.000Z'),
        })

        await expect(brokenService.resolveWebhook(created.id)).rejects.toThrow('NOTIFICATION_DESTINATION_DECRYPTION_FAILED')
        sqlite.close()
    })

    test('삭제는 이름 확인을 요구하고 불일치 시 거부합니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        const created = await service.upsert(actorId, upsertInput())

        await expect(service.remove(created.id, { confirmation: 'wrong-name' })).rejects.toThrow('CONFIRMATION_MISMATCH')
        await expect(service.remove(created.id, { confirmation: 'ops-discord' })).resolves.toMatchObject({ name: 'ops-discord' })
        await expect(service.list()).resolves.toHaveLength(0)
        sqlite.close()
    })

    test('enabled 상태를 토글할 수 있고 version은 유지합니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        const created = await service.upsert(actorId, upsertInput())

        const disabled = await service.setEnabled(created.id, false)
        expect(disabled).toMatchObject({ enabled: false, version: 1 })
        expect((await service.resolveWebhook(created.id)).enabled).toBe(false)
        sqlite.close()
    })

    test('https가 아닌 URL과 중복 event type을 거부합니다', async () => {
        const { actorId, service, sqlite } = await createTestContext()
        await expect(service.upsert(actorId, upsertInput({ webhookUrl: 'http://discord.com/api/webhooks/123/abc' }))).rejects.toThrow()
        await expect(service.upsert(actorId, upsertInput({ eventTypes: ['backup.failed', 'backup.failed'] }))).rejects.toThrow()
        sqlite.close()
    })
})
