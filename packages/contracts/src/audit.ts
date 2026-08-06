import { z } from 'zod'

export const AUDIT_TARGET_TYPES = [
    'artifact',
    'backup',
    'container',
    'deployment-manifest',
    'deployment-release',
    'deployment-secret',
    'deployment-stack',
    'image',
    'invitation',
    'job',
    'maintenance',
    'network',
    'nginx-config',
    'nginx-route',
    'notification-destination',
    'panel-setting',
    'trusted-proxy',
    'registry-credential',
    'system',
    'user',
    'volume',
] as const

export const AUDIT_RESULTS = ['attempt', 'failure', 'success'] as const

export const AUDIT_PAGE_SIZE_MAX = 200
export const AUDIT_PAGE_SIZE_DEFAULT = 50

export const auditQuerySchema = z
    .object({
        actorEmail: z.string().min(1).max(320).optional(),
        from: z.iso.datetime().optional(),
        limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_SIZE_MAX).default(AUDIT_PAGE_SIZE_DEFAULT),
        operation: z.string().min(1).max(128).optional(),
        page: z.coerce.number().int().min(1).default(1),
        result: z.enum(AUDIT_RESULTS).optional(),
        targetId: z.string().min(1).max(256).optional(),
        targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
        to: z.iso.datetime().optional(),
    })
    .refine((query) => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), {
        message: 'from 은 to 보다 이후일 수 없습니다.',
        path: ['from'],
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
    result: z.enum(AUDIT_RESULTS),
    sourceIpMasked: z.string().nullable(),
    targetId: z.string().nullable(),
    targetType: z.string().min(1),
})

export const auditEventListSchema = z.array(auditEventSchema)

export const auditPaginationSchema = z.object({
    limit: z.number().int().min(1),
    page: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
})

export const auditEventPageSchema = z.object({
    data: auditEventListSchema,
    pagination: auditPaginationSchema,
})

export type AuditResult = (typeof AUDIT_RESULTS)[number]
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]
export type AuditEvent = z.infer<typeof auditEventSchema>
export type AuditEventPage = z.infer<typeof auditEventPageSchema>
export type AuditQuery = z.infer<typeof auditQuerySchema>
