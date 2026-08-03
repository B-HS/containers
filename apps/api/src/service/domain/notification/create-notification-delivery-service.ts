import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
    NOTIFICATION_DELIVERY_STATUS,
    NOTIFICATION_EVENT_TYPE,
    notificationDeliverJobPayloadSchema,
    type NotificationDeliverJobPayload,
    type NotificationDestination,
} from '@containers/contracts/notification'
import { OPERATION_JOB_KIND, type OperationJob } from '@containers/contracts/operation-job'
import type { ControlDatabase } from '@containers/db-schema/database'
import { notificationDelivery } from '@containers/db-schema/schema'
import { createJobError, type OperationJobHandler } from '../job/create-operation-job-service'
import type { NotificationDestinationService } from './create-notification-destination-service'

const DELIVERY_MAX_ATTEMPTS = 3
const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000
const MIN_RETRY_AFTER_MS = 1_000
const MAX_RETRY_AFTER_MS = 3_600_000

const isUniqueViolation = (error: unknown) => error instanceof Error && error.message.includes('UNIQUE constraint failed')

const clampRetryAfter = (milliseconds: number) => Math.min(Math.max(milliseconds, MIN_RETRY_AFTER_MS), MAX_RETRY_AFTER_MS)

type EnqueueJob = (input: {
    kind: typeof OPERATION_JOB_KIND.NOTIFICATION_DELIVER
    maxAttempts: number
    payload: NotificationDeliverJobPayload
}) => Promise<OperationJob>

type NotificationDeliveryServiceDependencies = {
    db: ControlDatabase
    destinationService: Pick<NotificationDestinationService, 'list' | 'resolveWebhook'>
    enqueue: EnqueueJob
    now: () => Date
}

const buildEmbed = (payload: NotificationDeliverJobPayload) => {
    if (payload.eventType === NOTIFICATION_EVENT_TYPE.TEST) {
        return {
            color: 0x2ecc71,
            description: `알림 대상 **${payload.destinationName}** 으로의 테스트 알림이 정상적으로 전달되었습니다.`,
            timestamp: payload.occurredAt,
            title: '알림 테스트 성공',
        }
    }
    return {
        color: 0xe74c3c,
        fields: [
            { inline: true, name: '실패 코드', value: payload.failureCode ?? '알 수 없음' },
            { inline: true, name: '작업 ID', value: payload.sourceJobId.slice(0, 8) },
            { inline: false, name: '발생 시각', value: payload.occurredAt },
        ],
        timestamp: payload.occurredAt,
        title: '백업 실패',
    }
}

export const createNotificationDeliveryService = ({ db, destinationService, enqueue, now }: NotificationDeliveryServiceDependencies) => {
    const updateDelivery = async (id: string, values: Partial<typeof notificationDelivery.$inferInsert>) => {
        await db
            .update(notificationDelivery)
            .set({ ...values, updatedAt: now() })
            .where(eq(notificationDelivery.id, id))
    }

    const handleDeliver: OperationJobHandler = async ({ job }) => {
        const payload = notificationDeliverJobPayloadSchema.parse(job.payload)
        const destination = await destinationService.resolveWebhook(payload.destinationId)
        if (!destination.enabled) {
            await updateDelivery(payload.deliveryId, {
                failureCode: 'NOTIFICATION_DESTINATION_DISABLED',
                status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
            })
            return { skipped: true }
        }
        let response: Response
        try {
            response = await fetch(destination.webhookUrl, {
                body: JSON.stringify({ embeds: [buildEmbed(payload)] }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
                signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
            })
        } catch {
            throw createJobError('NOTIFY_TRANSPORT_FAILED')
        }
        if (response.status >= 200 && response.status < 300) {
            return { statusCode: response.status }
        }
        if (response.status === 429) {
            const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
            if (Number.isFinite(retryAfter)) {
                throw createJobError('NOTIFY_RATE_LIMITED', { retryAfterMs: clampRetryAfter(retryAfter * 1_000) })
            }
            throw createJobError('NOTIFY_RATE_LIMITED')
        }
        if (response.status >= 400 && response.status < 500) {
            throw createJobError('NOTIFY_REJECTED', { terminal: true })
        }
        throw createJobError('NOTIFY_TRANSPORT_FAILED')
    }

    const syncDeliverJobOutcome = async (job: OperationJob) => {
        const payload = notificationDeliverJobPayloadSchema.safeParse(job.payload)
        if (!payload.success) {
            return
        }
        const [delivery] = await db.select().from(notificationDelivery).where(eq(notificationDelivery.id, payload.data.deliveryId)).limit(1)
        if (!delivery || delivery.status !== NOTIFICATION_DELIVERY_STATUS.QUEUED) {
            return
        }
        if (job.status === 'succeeded') {
            const skipped = (job.result as { skipped?: boolean } | null)?.skipped === true
            const values: Partial<typeof notificationDelivery.$inferInsert> = { status: NOTIFICATION_DELIVERY_STATUS.DELIVERED }
            if (skipped) {
                values.failureCode = 'NOTIFICATION_DESTINATION_DISABLED'
            }
            await updateDelivery(payload.data.deliveryId, values)
            return
        }
        await updateDelivery(payload.data.deliveryId, {
            failureCode: job.failureCode ?? 'JOB_FAILED',
            status: NOTIFICATION_DELIVERY_STATUS.FAILED,
        })
    }

    const deliverTest = async (destinationId: string) => {
        const destination = await destinationService.resolveWebhook(destinationId)
        const id = randomUUID()
        const timestamp = now()
        if (!destination.enabled) {
            await db.insert(notificationDelivery).values({
                createdAt: timestamp,
                destinationId,
                eventType: NOTIFICATION_EVENT_TYPE.TEST,
                failureCode: 'NOTIFICATION_DESTINATION_DISABLED',
                id,
                sourceJobId: id,
                status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
                updatedAt: timestamp,
            })
            return { destinationId, id, skipped: true, status: NOTIFICATION_DELIVERY_STATUS.DELIVERED }
        }
        await db.insert(notificationDelivery).values({
            createdAt: timestamp,
            destinationId,
            eventType: NOTIFICATION_EVENT_TYPE.TEST,
            failureCode: null,
            id,
            sourceJobId: id,
            status: NOTIFICATION_DELIVERY_STATUS.QUEUED,
            updatedAt: timestamp,
        })
        const job = await enqueue({
            kind: OPERATION_JOB_KIND.NOTIFICATION_DELIVER,
            maxAttempts: DELIVERY_MAX_ATTEMPTS,
            payload: notificationDeliverJobPayloadSchema.parse({
                deliveryId: id,
                destinationId,
                destinationName: destination.name,
                eventType: NOTIFICATION_EVENT_TYPE.TEST,
                failureCode: null,
                occurredAt: timestamp.toISOString(),
                sourceJobId: id,
            }),
        })
        await updateDelivery(id, { jobId: job.id })
        return { destinationId, id, status: NOTIFICATION_DELIVERY_STATUS.QUEUED }
    }

    const deliverBackupFailure = async (destination: NotificationDestination, sourceJob: OperationJob) => {
        const id = randomUUID()
        try {
            await db.insert(notificationDelivery).values({
                createdAt: now(),
                destinationId: destination.id,
                eventType: NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
                failureCode: sourceJob.failureCode,
                id,
                sourceJobId: sourceJob.id,
                status: NOTIFICATION_DELIVERY_STATUS.QUEUED,
                updatedAt: now(),
            })
        } catch (error) {
            if (isUniqueViolation(error)) {
                return
            }
            throw error
        }
        const job = await enqueue({
            kind: OPERATION_JOB_KIND.NOTIFICATION_DELIVER,
            maxAttempts: DELIVERY_MAX_ATTEMPTS,
            payload: notificationDeliverJobPayloadSchema.parse({
                deliveryId: id,
                destinationId: destination.id,
                destinationName: destination.name,
                eventType: NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
                failureCode: sourceJob.failureCode,
                occurredAt: sourceJob.finishedAt ?? sourceJob.updatedAt,
                sourceJobId: sourceJob.id,
            }),
        })
        await updateDelivery(id, { jobId: job.id })
    }

    const produce = async (job: OperationJob) => {
        if (
            job.kind !== OPERATION_JOB_KIND.BACKUP_CREATE ||
            job.status !== 'failed' ||
            job.failureCode === null ||
            job.failureCode === 'JOB_CANCELLED'
        ) {
            return
        }
        const destinations = (await destinationService.list()).filter(
            (destination) => destination.enabled && destination.eventTypes.includes(NOTIFICATION_EVENT_TYPE.BACKUP_FAILED),
        )
        await Promise.all(destinations.map(async (destination) => deliverBackupFailure(destination, job)))
    }

    const reconcileQueued = async () => {
        const queued = await db.select().from(notificationDelivery).where(eq(notificationDelivery.status, NOTIFICATION_DELIVERY_STATUS.QUEUED))
        for (const delivery of queued) {
            if (delivery.jobId !== null) {
                continue
            }
            const destination = await destinationService.resolveWebhook(delivery.destinationId).catch(() => null)
            if (destination === null) {
                await updateDelivery(delivery.id, { failureCode: 'NOTIFICATION_DESTINATION_NOT_FOUND', status: NOTIFICATION_DELIVERY_STATUS.FAILED })
                continue
            }
            if (!destination.enabled) {
                await updateDelivery(delivery.id, {
                    failureCode: 'NOTIFICATION_DESTINATION_DISABLED',
                    status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
                })
                continue
            }
            const job = await enqueue({
                kind: OPERATION_JOB_KIND.NOTIFICATION_DELIVER,
                maxAttempts: DELIVERY_MAX_ATTEMPTS,
                payload: notificationDeliverJobPayloadSchema.parse({
                    deliveryId: delivery.id,
                    destinationId: delivery.destinationId,
                    destinationName: destination.name,
                    eventType: delivery.eventType,
                    failureCode: delivery.failureCode,
                    occurredAt: delivery.createdAt.toISOString(),
                    sourceJobId: delivery.sourceJobId,
                }),
            })
            await updateDelivery(delivery.id, { jobId: job.id })
        }
    }

    return {
        deliverTest,
        handleDeliver,
        onFinished: async (job: OperationJob) => {
            if (job.kind === OPERATION_JOB_KIND.NOTIFICATION_DELIVER) {
                await syncDeliverJobOutcome(job)
                return
            }
            await produce(job)
        },
        reconcileQueued,
    }
}

export type NotificationDeliveryService = ReturnType<typeof createNotificationDeliveryService>
