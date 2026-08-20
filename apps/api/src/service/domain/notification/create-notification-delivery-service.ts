import type { NotificationDeliveryStatus, NotificationEventType } from '@containers/contracts/notification'
import { randomUUID } from 'node:crypto'
import {
    NOTIFICATION_DELIVERY_STATUS,
    NOTIFICATION_EVENT_TYPE,
    notificationDeliverJobPayloadSchema,
    type NotificationDeliverJobPayload,
    type NotificationDestination,
} from '@containers/contracts/notification'
import { OPERATION_JOB_KIND, type OperationJob, type OperationJobKind } from '@containers/contracts/operation-job'
import type { EgressWebhookResult } from '@containers/contracts/egress'
import { createJobError, type OperationJobHandler } from '../job/create-operation-job-service'
import type { NotificationDestinationService } from './create-notification-destination-service'

const DELIVERY_MAX_ATTEMPTS = 3
const CANCELLED_FAILURE_CODE = 'JOB_CANCELLED'

const FAILURE_EVENT_BY_JOB_KIND: Record<OperationJobKind, NotificationEventType | null> = {
    [OPERATION_JOB_KIND.BACKUP_CREATE]: NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
    [OPERATION_JOB_KIND.BACKUP_RESTORE]: NOTIFICATION_EVENT_TYPE.RESTORE_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_LOAD]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_RELEASE]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_ROLLBACK]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_STACK_RELEASE]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.IMAGE_PULL]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.NOTIFICATION_DELIVER]: null,
    [OPERATION_JOB_KIND.SECRET_ROTATE]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.SYSTEM_PRUNE]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.TRAFFIC_EXPORT]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.UPLOAD_FINALIZE]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
}

const REPORT_EMBED_TITLE = '운영 정기 보고'
const REPORT_HEALTHY_COLOR = 3_066_993
const REPORT_BROKEN_MARKER = '끊김'

const FAILURE_EMBED_TITLE = {
    [NOTIFICATION_EVENT_TYPE.BACKUP_FAILED]: '백업 실패',
    [NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED]: '배포 실패',
    [NOTIFICATION_EVENT_TYPE.JOB_FAILED]: '작업 실패',
    [NOTIFICATION_EVENT_TYPE.RESTORE_FAILED]: '복원 실패',
}
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

type DeliveryRow = {
    createdAt: Date
    destinationId: string
    eventType: NotificationEventType
    failureCode: string | null
    id: string
    jobId: string | null
    sourceJobId: string
    status: NotificationDeliveryStatus
    updatedAt: Date
}

type DeliveryInsertRecord = {
    createdAt: Date
    destinationId: string
    eventType: NotificationEventType
    failureCode: string | null
    id: string
    jobId?: string | null
    sourceJobId: string
    status: NotificationDeliveryStatus
    updatedAt: Date
}

type NotificationDeliveryServiceDb = {
    findById: (id: string) => Promise<DeliveryRow | undefined>
    listQueued: () => Promise<DeliveryRow[]>
    insert: (record: DeliveryInsertRecord) => Promise<void>
    update: (
        id: string,
        values: { failureCode?: string | null; jobId?: string | null; status?: NotificationDeliveryStatus; updatedAt: Date },
    ) => Promise<void>
}

type NotificationDeliveryServiceDependencies = {
    db: NotificationDeliveryServiceDb
    deliverWebhook: (input: { body: string; timeoutMs: number; url: string }) => Promise<EgressWebhookResult>
    destinationService: Pick<NotificationDestinationService, 'list' | 'resolveWebhook'>
    enqueue: EnqueueJob
    now: () => Date
}

export type { NotificationDeliveryServiceDb }

const buildEmbed = (payload: NotificationDeliverJobPayload) => {
    if (payload.eventType === NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT) {
        const broken = payload.report.some((field) => field.value.includes(REPORT_BROKEN_MARKER))
        return {
            color: broken ? undefined : REPORT_HEALTHY_COLOR,
            fields: payload.report.map((field) => ({ inline: true, name: field.name, value: field.value })),
            timestamp: payload.occurredAt,
            title: REPORT_EMBED_TITLE,
        }
    }
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
            { inline: true, name: '작업 종류', value: payload.sourceJobKind ?? '알 수 없음' },
            { inline: true, name: '작업 ID', value: payload.sourceJobId.slice(0, 8) },
            { inline: false, name: '발생 시각', value: payload.occurredAt },
        ],
        timestamp: payload.occurredAt,
        title: FAILURE_EMBED_TITLE[payload.eventType],
    }
}

export const createNotificationDeliveryService = ({
    db,
    deliverWebhook,
    destinationService,
    enqueue,
    now,
}: NotificationDeliveryServiceDependencies) => {
    const updateDelivery = async (
        id: string,
        values: { failureCode?: string | null; jobId?: string | null; status?: NotificationDeliveryStatus },
    ) => {
        await db.update(id, { ...values, updatedAt: now() })
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
        let result: EgressWebhookResult
        try {
            result = await deliverWebhook({
                body: JSON.stringify({ embeds: [buildEmbed(payload)] }),
                timeoutMs: WEBHOOK_REQUEST_TIMEOUT_MS,
                url: destination.webhookUrl,
            })
        } catch {
            throw createJobError('NOTIFY_TRANSPORT_FAILED')
        }
        if (result.status >= 200 && result.status < 300) {
            return { statusCode: result.status }
        }
        if (result.status === 429) {
            if (result.retryAfterSeconds !== null) {
                throw createJobError('NOTIFY_RATE_LIMITED', { retryAfterMs: clampRetryAfter(result.retryAfterSeconds * 1_000) })
            }
            throw createJobError('NOTIFY_RATE_LIMITED')
        }
        if (result.status >= 400 && result.status < 500) {
            throw createJobError('NOTIFY_REJECTED', { terminal: true })
        }
        throw createJobError('NOTIFY_TRANSPORT_FAILED')
    }

    const syncDeliverJobOutcome = async (job: OperationJob) => {
        const payload = notificationDeliverJobPayloadSchema.safeParse(job.payload)
        if (!payload.success) {
            return
        }
        const delivery = await db.findById(payload.data.deliveryId)
        if (!delivery || delivery.status !== NOTIFICATION_DELIVERY_STATUS.QUEUED) {
            return
        }
        if (job.status === 'succeeded') {
            const skipped = (job.result as { skipped?: boolean } | null)?.skipped === true
            const values: { failureCode?: string | null; status: NotificationDeliveryStatus } = { status: NOTIFICATION_DELIVERY_STATUS.DELIVERED }
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
            await db.insert({
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
        await db.insert({
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

    const deliverJobFailure = async (
        destination: NotificationDestination,
        sourceJob: OperationJob,
        eventType: (typeof NOTIFICATION_EVENT_TYPE)[keyof typeof NOTIFICATION_EVENT_TYPE],
    ) => {
        const id = randomUUID()
        try {
            await db.insert({
                createdAt: now(),
                destinationId: destination.id,
                eventType,
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
                eventType,
                failureCode: sourceJob.failureCode,
                occurredAt: sourceJob.finishedAt ?? sourceJob.updatedAt,
                sourceJobId: sourceJob.id,
                sourceJobKind: sourceJob.kind,
            }),
        })
        await updateDelivery(id, { jobId: job.id })
    }

    const broadcastReport = async (report: { name: string; value: string }[]) => {
        const destinations = (await destinationService.list()).filter(
            (destination) => destination.enabled && destination.eventTypes.includes(NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT),
        )
        for (const destination of destinations) {
            const id = randomUUID()
            const timestamp = now()
            await db.insert({
                createdAt: timestamp,
                destinationId: destination.id,
                eventType: NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT,
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
                    destinationId: destination.id,
                    destinationName: destination.name,
                    eventType: NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT,
                    failureCode: null,
                    occurredAt: timestamp.toISOString(),
                    report,
                    sourceJobId: id,
                }),
            })
            await updateDelivery(id, { jobId: job.id })
        }
        return destinations.length
    }

    const produce = async (job: OperationJob) => {
        if (job.status !== 'failed' || job.failureCode === null || job.failureCode === CANCELLED_FAILURE_CODE) {
            return
        }
        const eventType = FAILURE_EVENT_BY_JOB_KIND[job.kind]
        if (eventType === null) {
            return
        }
        const destinations = (await destinationService.list()).filter(
            (destination) => destination.enabled && destination.eventTypes.includes(eventType),
        )
        await Promise.all(destinations.map(async (destination) => deliverJobFailure(destination, job, eventType)))
    }

    const reconcileQueued = async () => {
        const queued = await db.listQueued()
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
        broadcastReport,
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
