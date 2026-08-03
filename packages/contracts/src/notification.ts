import { z } from 'zod'

export const NOTIFICATION_DESTINATION_TYPE = {
    DISCORD: 'discord',
} as const

export const NOTIFICATION_EVENT_TYPE = {
    BACKUP_FAILED: 'backup.failed',
    TEST: 'test',
} as const

export const NOTIFICATION_DELIVERY_STATUS = {
    DELIVERED: 'delivered',
    FAILED: 'failed',
    QUEUED: 'queued',
} as const

export const notificationDestinationTypeSchema = z.enum([NOTIFICATION_DESTINATION_TYPE.DISCORD])

export const notificationEventTypeSchema = z.enum([NOTIFICATION_EVENT_TYPE.BACKUP_FAILED, NOTIFICATION_EVENT_TYPE.TEST])

export const notificationWebhookUrlSchema = z
    .string()
    .min(1)
    .max(2_048)
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'https URL만 허용됩니다.' })

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

export const notificationDeliverJobPayloadSchema = z.object({
    deliveryId: z.uuid(),
    destinationId: z.uuid(),
    destinationName: z.string().min(1).max(64),
    eventType: notificationEventTypeSchema,
    failureCode: z.string().nullable(),
    occurredAt: z.iso.datetime(),
    sourceJobId: z.uuid(),
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
export type NotificationDestination = z.infer<typeof notificationDestinationSchema>
export type NotificationDestinationUpsert = z.infer<typeof notificationDestinationUpsertSchema>
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>
