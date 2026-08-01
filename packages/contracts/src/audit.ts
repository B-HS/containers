import { z } from 'zod'

export const auditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    operation: z.string().min(1).max(128).optional(),
    result: z.enum(['attempt', 'failure', 'success']).optional(),
    targetType: z.string().min(1).max(64).optional(),
})

export const auditEventSchema = z.object({
    actorEmail: z.string().nullable(),
    actorId: z.string().nullable(),
    authMethod: z.string(),
    createdAt: z.iso.datetime(),
    detail: z.record(z.string(), z.unknown()).nullable(),
    id: z.string().min(1),
    operation: z.string().min(1),
    requestId: z.string().min(1),
    result: z.enum(['attempt', 'failure', 'success']),
    sourceIpMasked: z.string().nullable(),
    targetId: z.string().nullable(),
    targetType: z.string().min(1),
})

export const auditEventListSchema = z.array(auditEventSchema)

export type AuditEvent = z.infer<typeof auditEventSchema>
