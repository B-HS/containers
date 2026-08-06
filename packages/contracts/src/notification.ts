import { z } from 'zod'
import { operationJobKindSchema } from './operation-job'

export const NOTIFICATION_DESTINATION_TYPE = {
    DISCORD: 'discord',
} as const

export const NOTIFICATION_EVENT_TYPE = {
    BACKUP_FAILED: 'backup.failed',
    DEPLOY_FAILED: 'deploy.failed',
    JOB_FAILED: 'job.failed',
    RESTORE_FAILED: 'restore.failed',
    SYSTEM_REPORT: 'system.report',
    TEST: 'test',
} as const

export const NOTIFICATION_SUBSCRIBABLE_EVENT_TYPES = [
    NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
    NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    NOTIFICATION_EVENT_TYPE.RESTORE_FAILED,
    NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT,
] as const

export const NOTIFICATION_DELIVERY_STATUS = {
    DELIVERED: 'delivered',
    FAILED: 'failed',
    QUEUED: 'queued',
} as const

export const notificationDestinationTypeSchema = z.enum([NOTIFICATION_DESTINATION_TYPE.DISCORD])

export const notificationEventTypeSchema = z.enum([
    NOTIFICATION_EVENT_TYPE.BACKUP_FAILED,
    NOTIFICATION_EVENT_TYPE.DEPLOY_FAILED,
    NOTIFICATION_EVENT_TYPE.JOB_FAILED,
    NOTIFICATION_EVENT_TYPE.RESTORE_FAILED,
    NOTIFICATION_EVENT_TYPE.SYSTEM_REPORT,
    NOTIFICATION_EVENT_TYPE.TEST,
])

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

const isBlockedIpAddress = (hostname: string) => {
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
        const octets = ipv4.slice(1).map(Number)
        if (octets.some((octet) => octet > 255)) {
            return true
        }
        return isPrivateIpv4(octets)
    }
    if (/^\[/.test(hostname)) {
        const ipv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase()
        if (ipv6 === '::1' || ipv6.startsWith('fe80')) return true
        if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) return true
        const mappedIpv4 = ipv6.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
        if (mappedIpv4) {
            return isPrivateIpv4(mappedIpv4.slice(1).map(Number))
        }
        return true
    }
    if (!hostname.includes('.')) {
        return true
    }
    return false
}

export const notificationWebhookUrlSchema = z
    .string()
    .min(1)
    .max(2_048)
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'https URL만 허용됩니다.' })
    .refine(
        (value) => {
            try {
                return !isBlockedIpAddress(new URL(value).hostname)
            } catch {
                return false
            }
        },
        { message: '내부 네트워크 주소는 허용되지 않습니다.' },
    )

export const notificationDestinationUpsertSchema = z
    .object({
        enabled: z.boolean(),
        eventTypes: z.array(notificationEventTypeSchema).min(1),
        name: z.string().min(1).max(64),
        type: notificationDestinationTypeSchema,
        webhookUrl: notificationWebhookUrlSchema,
    })
    .refine((input) => new Set(input.eventTypes).size === input.eventTypes.length, {
        message: '중복된 event type은 허용되지 않습니다.',
        path: ['eventTypes'],
    })
    .refine((input) => !input.eventTypes.includes(NOTIFICATION_EVENT_TYPE.TEST), {
        message: 'test event type은 구독할 수 없습니다.',
        path: ['eventTypes'],
    })

export const notificationDestinationDeleteSchema = z.object({ confirmation: z.string().min(1).max(64) })

export const notificationDeliveryStatusSchema = z.enum([
    NOTIFICATION_DELIVERY_STATUS.DELIVERED,
    NOTIFICATION_DELIVERY_STATUS.FAILED,
    NOTIFICATION_DELIVERY_STATUS.QUEUED,
])

export const notificationDeliverySummarySchema = z.object({
    at: z.iso.datetime().nullable(),
    failureCode: z.string().nullable(),
    status: notificationDeliveryStatusSchema.nullable(),
})

export const notificationDestinationSchema = z.object({
    createdAt: z.iso.datetime(),
    enabled: z.boolean(),
    eventTypes: z.array(notificationEventTypeSchema),
    id: z.uuid(),
    lastDelivery: notificationDeliverySummarySchema,
    name: z.string().min(1).max(64),
    type: notificationDestinationTypeSchema,
    updatedAt: z.iso.datetime(),
    version: z.number().int().positive(),
})

export const notificationDestinationListSchema = z.array(notificationDestinationSchema)

export const REPORT_FIELD_LIMIT = 24

export const notificationReportFieldSchema = z.object({
    name: z.string().min(1).max(64),
    value: z.string().min(1).max(512),
})

export const notificationDeliverJobPayloadSchema = z.object({
    deliveryId: z.uuid(),
    destinationId: z.uuid(),
    destinationName: z.string().min(1).max(64),
    eventType: notificationEventTypeSchema,
    failureCode: z.string().nullable(),
    occurredAt: z.iso.datetime(),
    report: z.array(notificationReportFieldSchema).max(REPORT_FIELD_LIMIT).default([]),
    sourceJobId: z.uuid(),
    sourceJobKind: operationJobKindSchema.nullable().default(null),
})

export const notificationDeliverySchema = z.object({
    createdAt: z.iso.datetime(),
    destinationId: z.uuid(),
    eventType: notificationEventTypeSchema,
    failureCode: z.string().nullable(),
    id: z.uuid(),
    jobId: z.uuid().nullable(),
    sourceJobId: z.string(),
    status: notificationDeliveryStatusSchema,
    updatedAt: z.iso.datetime(),
})

export type NotificationDeliverJobPayload = z.infer<typeof notificationDeliverJobPayloadSchema>
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>
export type NotificationDestination = z.infer<typeof notificationDestinationSchema>
export type NotificationDestinationUpsert = z.infer<typeof notificationDestinationUpsertSchema>
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>
