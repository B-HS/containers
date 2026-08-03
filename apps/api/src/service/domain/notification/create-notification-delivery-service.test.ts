import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { notificationDelivery, user } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/app-error'
import { createOperationJobService } from '../job/create-operation-job-service'
import { createNotificationDeliveryService } from './create-notification-delivery-service'
import { createNotificationDestinationService } from './create-notification-destination-service'

const originalFetch = globalThis.fetch

const temporaryDirectories: string[] = []
const webhookUrl = 'https://discord.com/api/webhooks/123/abc'
const flush = async () => Bun.sleep(5)

afterEach(async () => {
    globalThis.fetch = originalFetch
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (fetchStatus: number | ((url: string) => Promise<Response>) = 200) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-notification-delivery-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const clock = { value: Date.parse('2026-08-01T00:00:00.000Z') }
    const timestamp = new Date(clock.value)
    await database.db.insert(user).values({
        createdAt: timestamp,
        email: 'owner@example.com',
        emailVerified: true,
        id: 'notification-owner',
        name: 'Owner',
        updatedAt: timestamp,
    })
    const requests: { body: unknown; url: string }[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requests.push({ body: init?.body === undefined ? null : JSON.parse(String(init.body)), url })
        return typeof fetchStatus === 'function' ? fetchStatus(url) : new Response('ok', { status: fetchStatus })
    }) as typeof fetch
    const destinationService = createNotificationDestinationService({
        db: database.db,
        masterSecret: 'test-master-secret-that-is-longer-than-thirty-two-characters',
        now: () => new Date(clock.value),
    })
    let jobService: ReturnType<typeof createOperationJobService> | null = null
    const deliveryService = createNotificationDeliveryService({
        db: database.db,
        destinationService,
        enqueue: (input) => {
            if (jobService === null) {
                throw createAppError('ENQUEUE_UNAVAILABLE')
            }
            return jobService.enqueue(input)
        },
        now: () => new Date(clock.value),
    })
    jobService = createOperationJobService({
        db: database.db,
        handlers: {
            'backup.create': async ({ job }) => {
                if (job.payload.fail === true) {
                    throw createAppError('BACKUP_ENGINE_FAILED')
                }
                return null
            },
            'notification.deliver': deliveryService.handleDeliver,
        },
        now: () => new Date(clock.value),
        onFinished: (job) => deliveryService.onFinished(job),
    })
    return { clock, database, deliveryService, destinationService, jobService, requests }
}

const upsertDiscord = async (destinationService: ReturnType<typeof createNotificationDestinationService>, name = 'ops-discord') =>
    destinationService.upsert('notification-owner', {
        enabled: true,
        eventTypes: ['backup.failed'],
        name,
        type: 'discord',
        webhookUrl,
    })

describe('notification delivery service', () => {
    test('backup 실패 시 구독 중인 대상으로 durable job 을 생성하고 전송 후 delivered 로 확정합니다', async () => {
        const { database, destinationService, jobService, requests } = await createTestContext(200)
        const destination = await upsertDiscord(destinationService)
        const sourceJob = await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })

        await jobService.tick()
        await flush()
        await jobService.tick()
        await flush()

        const [delivery] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.destinationId, destination.id))
        expect(delivery).toMatchObject({
            eventType: 'backup.failed',
            failureCode: 'BACKUP_ENGINE_FAILED',
            sourceJobId: sourceJob.id,
            status: 'delivered',
        })
        expect(delivery?.jobId).not.toBeNull()
        expect(requests).toHaveLength(1)
        expect(requests[0]).toMatchObject({ body: { embeds: [{ color: 15158332, title: '백업 실패' }] }, url: webhookUrl })
        expect((await jobService.get(delivery?.jobId as string)).status).toBe('succeeded')
    })

    test('같은 원본 job 과 대상의 중복 전달은 생성되지 않습니다', async () => {
        const { database, destinationService, deliveryService, jobService, requests } = await createTestContext(200)
        await upsertDiscord(destinationService)
        const sourceJob = await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })

        await jobService.tick()
        await flush()
        await deliveryService.onFinished(await jobService.get(sourceJob.id))
        await flush()
        await jobService.tick()
        await flush()

        expect(await database.db.select().from(notificationDelivery)).toHaveLength(1)
        expect(requests).toHaveLength(1)
    })

    test('성공한 backup job 은 전달을 생성하지 않습니다', async () => {
        const { database, destinationService, jobService, requests } = await createTestContext(200)
        await upsertDiscord(destinationService)

        await jobService.enqueue({ kind: 'backup.create', payload: {} })
        await jobService.tick()
        await flush()

        expect(await database.db.select().from(notificationDelivery)).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })

    test('비활성 대상은 전달을 생성하지 않습니다', async () => {
        const { database, destinationService, jobService, requests } = await createTestContext(200)
        await destinationService.upsert('notification-owner', {
            enabled: false,
            eventTypes: ['backup.failed'],
            name: 'disabled-discord',
            type: 'discord',
            webhookUrl,
        })

        await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })
        await jobService.tick()
        await flush()

        expect(await database.db.select().from(notificationDelivery)).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })

    test('webhook 이 4xx 를 반환하면 재시도 없이 실패로 확정합니다', async () => {
        const { database, destinationService, jobService, requests } = await createTestContext(400)
        const destination = await upsertDiscord(destinationService)

        await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })
        await jobService.tick()
        await flush()
        await jobService.tick()
        await flush()

        const [delivery] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.destinationId, destination.id))
        expect(delivery).toMatchObject({ failureCode: 'NOTIFY_REJECTED', status: 'failed' })
        expect(requests).toHaveLength(1)
    })

    test('429 응답은 재시도 후 소진 시 실패로 확정합니다', async () => {
        const { clock, database, destinationService, jobService, requests } = await createTestContext(429)
        const destination = await upsertDiscord(destinationService)

        await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })
        await jobService.tick()
        await flush()
        await jobService.tick()
        await flush()
        clock.value += 60_000
        await jobService.tick()
        await flush()
        clock.value += 120_000
        await jobService.tick()
        await flush()

        const [delivery] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.destinationId, destination.id))
        expect(delivery).toMatchObject({ failureCode: 'NOTIFY_RATE_LIMITED', status: 'failed' })
        expect(requests).toHaveLength(3)
    })

    test('실행 시점에 대상이 비활성화되어 있으면 전송 없이 delivered 로 처리합니다', async () => {
        const { database, destinationService, jobService, requests } = await createTestContext(200)
        const destination = await upsertDiscord(destinationService)

        await jobService.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: { fail: true } })
        await jobService.tick()
        await flush()
        await destinationService.setEnabled(destination.id, false)
        await jobService.tick()
        await flush()

        const [delivery] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.destinationId, destination.id))
        expect(delivery).toMatchObject({ failureCode: 'NOTIFICATION_DESTINATION_DISABLED', status: 'delivered' })
        expect(requests).toHaveLength(0)
    })

    test('test delivery 는 job 을 생성하고 성공 시 delivered 로 확정합니다', async () => {
        const { database, destinationService, deliveryService, jobService, requests } = await createTestContext(200)
        const destination = await upsertDiscord(destinationService)

        const result = await deliveryService.deliverTest(destination.id)
        expect(result).toMatchObject({ status: 'queued' })
        await flush()
        await jobService.tick()
        await flush()

        const [row] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.eventType, 'test'))
        expect(row).toMatchObject({ destinationId: destination.id, status: 'delivered' })
        expect(requests).toHaveLength(1)
        const [request] = requests
        expect(request?.body).toMatchObject({ embeds: [{ color: 3066993, title: '알림 테스트 성공' }] })
    })

    test('reconcileQueued 는 job 이 없는 queued delivery 를 다시 등록합니다', async () => {
        const { database, destinationService, deliveryService, jobService, requests } = await createTestContext(200)
        const destination = await upsertDiscord(destinationService)
        const orphanId = '7f1e3c9a-2b4d-4e5f-8a6b-0c1d2e3f4a5b'
        await database.db.insert(notificationDelivery).values({
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            destinationId: destination.id,
            eventType: 'test',
            failureCode: null,
            id: orphanId,
            sourceJobId: orphanId,
            status: 'queued',
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        })

        await deliveryService.reconcileQueued()
        await flush()
        await jobService.tick()
        await flush()

        const [row] = await database.db.select().from(notificationDelivery).where(eq(notificationDelivery.id, orphanId))
        expect(row?.jobId).not.toBeNull()
        expect(requests).toHaveLength(1)
    })
})
