import { z } from 'zod'

export const EGRESS_WEBHOOK_BODY_MAX_BYTES = 65_536

const hostnameSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)

export const egressResolveRequestSchema = z.object({
    hostname: hostnameSchema,
})

export const egressResolveResultSchema = z.object({
    addresses: z.array(z.string()),
    blocked: z.boolean(),
    hostname: hostnameSchema,
})

export const egressWebhookRequestSchema = z.object({
    body: z.string().max(EGRESS_WEBHOOK_BODY_MAX_BYTES),
    timeoutMs: z.number().int().min(1_000).max(30_000).default(10_000),
    url: z
        .url()
        .max(2_048)
        .refine((value) => value.startsWith('https://')),
})

export const egressWebhookResultSchema = z.object({
    retryAfterSeconds: z.number().int().min(0).nullable(),
    status: z.number().int().min(100).max(599),
})

export type EgressResolveResult = z.infer<typeof egressResolveResultSchema>
export type EgressWebhookRequest = z.infer<typeof egressWebhookRequestSchema>
export type EgressWebhookResult = z.infer<typeof egressWebhookResultSchema>
