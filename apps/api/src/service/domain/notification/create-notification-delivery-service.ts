import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIPv6 } from 'node:net'
import {
    NOTIFICATION_DELIVERY_STATUS,
    NOTIFICATION_EVENT_TYPE,
    notificationDeliverJobPayloadSchema,
    type NotificationDeliverJobPayload,
    type NotificationDestination,
} from '@containers/contracts/notification'
import { OPERATION_JOB_KIND, type OperationJob, type OperationJobKind } from '@containers/contracts/operation-job'
import { createJobError, type OperationJobHandler } from '../job/create-operation-job-service'
import type { NotificationDestinationService } from './create-notification-destination-service'

const DELIVERY_MAX_ATTEMPTS = 3
const CANCELLED_FAILURE_CODE = 'JOB_CANCELLED'

const FAILURE_EVENT_BY_JOB_KIND: Partial<Record<OperationJobKind, (typeof NOTIFICATION_EVENT_TYPE)[keyof typeof NOTIFICATION_EVENT_TYPE]>> = {
    [OPERATION_JOB_KIND.BACKUP_CREATE]: NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
    [OPERATION_JOB_KIND.BACKUP_RESTORE]: NOTIFICATION_EVENT_TYPE.RESTORE_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_LOAD]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_RELEASE]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.DEPLOY_ROLLBACK]: NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    [OPERATION_JOB_KIND.IMAGE_PULL]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.SYSTEM_PRUNE]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.TRAFFIC_EXPORT]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    [OPERATION_JOB_KIND.UPLOAD_FINALIZE]: NOTIFICATION_EVENT_TYPE.JOB_FAILED,
}

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

const isPrivateIpv4 = (octets: number[]) => {
    const first = octets[0]
    const second = octets[1]
    if (first === undefined || second === undefined) return true
    if (first === 10) return true
    if (first === 127) return true
    if (first === 0) return true
    if (first === 169 && second === 254) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 168) return true
    if (first >= 224) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    if (first === 198 && second >= 18 && second <= 19) return true
    return false
}

const parseIpv6Bytes = (value: string): number[] | null => {
    const address = value.toLowerCase()
    const hasDoubleColon = address.includes('::')
    const parts = address.split('::')
    if (parts.length > 2) {
        return null
    }
    const [head = '', tail = ''] = parts
    const headGroups = head === '' ? [] : head.split(':')
    const tailGroups = tail === '' ? [] : tail.split(':')
    const headBytes: number[] = []
    const tailBytes: number[] = []
    const embed = (groups: string[]): number[] | null => {
        const result: number[] = []
        for (let index = 0; index < groups.length; index += 1) {
            const group = groups[index]
            if (group === undefined) {
                return null
            }
            const ipv4Embedded = group.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/)
            if (ipv4Embedded && index === groups.length - 1) {
                const octets = ipv4Embedded.slice(1).map(Number)
                if (octets.some((octet) => octet > 255)) {
                    return null
                }
                result.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0))
                continue
            }
            const parsed = Number.parseInt(group, 16)
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) {
                return null
            }
            result.push(parsed >> 8, parsed & 0xff)
        }
        return result
    }
    const headParsed = embed(headGroups)
    const tailParsed = embed(tailGroups)
    if (!headParsed || !tailParsed) {
        return null
    }
    headBytes.push(...headParsed)
    tailBytes.push(...tailParsed)
    if (!hasDoubleColon) {
        return headBytes.length === 16 ? headBytes : null
    }
    const zeroCount = 16 - headBytes.length - tailBytes.length
    if (zeroCount < 0 || zeroCount % 2 !== 0) {
        return null
    }
    return [...headBytes, ...Array.from({ length: zeroCount }, () => 0), ...tailBytes]
}

const isBlockedAddress = (address: string) => {
    const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
        return isPrivateIpv4(ipv4.slice(1).map(Number))
    }
    if (!isIPv6(address)) {
        return true
    }
    const bytes = parseIpv6Bytes(address)
    if (!bytes) {
        return true
    }
    const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff
    const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0)
    if (isIpv4Mapped || isIpv4Compatible) {
        return isPrivateIpv4([bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0])
    }
    const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && (bytes[15] ?? 0) === 1
    if (isLoopback || (bytes[0] === 0xfe && (bytes[1] ?? 0) & 0xc0)) {
        return true
    }
    if ((bytes[0] ?? 0) === 0xfc || (bytes[0] ?? 0) === 0xfd) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x02) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x01 && (bytes[2] ?? 0) === 0x00 && (bytes[3] ?? 0) === 0x00) {
        return true
    }
    if ((bytes[0] ?? 0) >= 0xff) {
        return true
    }
    return false
}

const assertPublicWebhookTarget = async (webhookUrl: string) => {
    const url = new URL(webhookUrl)
    if (url.protocol !== 'https:') {
        throw createJobError('NOTIFY_TRANSPORT_FAILED')
    }
    if (!url.hostname.includes('.')) {
        throw createJobError('NOTIFY_TRANSPORT_FAILED')
    }
    const addresses = await lookup(url.hostname, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
        throw createJobError('NOTIFY_TRANSPORT_FAILED')
    }
}

type EnqueueJob = (input: {
    kind: typeof OPERATION_JOB_KIND.NOTIFICATION_DELIVER
    maxAttempts: number
    payload: NotificationDeliverJobPayload
}) => Promise<OperationJob>

type DeliveryRow = {
    createdAt: Date
    destinationId: string
    eventType: string
    failureCode: string | null
    id: string
    jobId: string | null
    sourceJobId: string
    status: string
    updatedAt: Date
}

type DeliveryInsertRecord = {
    createdAt: Date
    destinationId: string
    eventType: string
    failureCode: string | null
    id: string
    jobId?: string | null
    sourceJobId: string
    status: string
    updatedAt: Date
}

type NotificationDeliveryServiceDb = {
    findById: (id: string) => Promise<DeliveryRow | undefined>
    listQueued: () => Promise<DeliveryRow[]>
    insert: (record: DeliveryInsertRecord) => Promise<void>
    update: (id: string, values: { failureCode?: string | null; jobId?: string | null; status?: string; updatedAt: Date }) => Promise<void>
}

type NotificationDeliveryServiceDependencies = {
    db: NotificationDeliveryServiceDb
    destinationService: Pick<NotificationDestinationService, 'list' | 'resolveWebhook'>
    enqueue: EnqueueJob
    now: () => Date
}

export type { NotificationDeliveryServiceDb }

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
            { inline: true, name: '작업 종류', value: payload.sourceJobKind ?? '알 수 없음' },
            { inline: true, name: '작업 ID', value: payload.sourceJobId.slice(0, 8) },
            { inline: false, name: '발생 시각', value: payload.occurredAt },
        ],
        timestamp: payload.occurredAt,
        title: FAILURE_EMBED_TITLE[payload.eventType],
    }
}

export const createNotificationDeliveryService = ({ db, destinationService, enqueue, now }: NotificationDeliveryServiceDependencies) => {
    const updateDelivery = async (id: string, values: { failureCode?: string | null; jobId?: string | null; status?: string }) => {
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
        let response: Response
        try {
            await assertPublicWebhookTarget(destination.webhookUrl)
            response = await fetch(destination.webhookUrl, {
                body: JSON.stringify({ embeds: [buildEmbed(payload)] }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
                redirect: 'manual',
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
        const delivery = await db.findById(payload.data.deliveryId)
        if (!delivery || delivery.status !== NOTIFICATION_DELIVERY_STATUS.QUEUED) {
            return
        }
        if (job.status === 'succeeded') {
            const skipped = (job.result as { skipped?: boolean } | null)?.skipped === true
            const values: { failureCode?: string | null; status: string } = { status: NOTIFICATION_DELIVERY_STATUS.DELIVERED }
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

    const produce = async (job: OperationJob) => {
        if (job.status !== 'failed' || job.failureCode === null || job.failureCode === CANCELLED_FAILURE_CODE) {
            return
        }
        const eventType = FAILURE_EVENT_BY_JOB_KIND[job.kind]
        if (eventType === undefined) {
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
