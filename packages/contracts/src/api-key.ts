import { z } from 'zod'

export const API_KEY_SCOPE = {
    ARTIFACT_READ: 'artifact:read',
    ARTIFACT_UPLOAD: 'artifact:upload',
    BACKUP_READ: 'backup:read',
    BACKUP_WRITE: 'backup:write',
    CONTROL_PLANE_READ: 'control-plane:read',
    DEPLOYMENT_READ: 'deployment:read',
    DEPLOYMENT_WRITE: 'deployment:write',
    ENGINE_READ: 'engine:read',
    IMAGE_LOAD: 'image:load',
    JOB_READ: 'job:read',
    JOB_WRITE: 'job:write',
    SECRET_READ: 'secret:read',
    SECRET_WRITE: 'secret:write',
} as const

export const API_KEY_SCOPE_VALUES = [
    API_KEY_SCOPE.ARTIFACT_READ,
    API_KEY_SCOPE.ARTIFACT_UPLOAD,
    API_KEY_SCOPE.BACKUP_READ,
    API_KEY_SCOPE.BACKUP_WRITE,
    API_KEY_SCOPE.CONTROL_PLANE_READ,
    API_KEY_SCOPE.DEPLOYMENT_READ,
    API_KEY_SCOPE.DEPLOYMENT_WRITE,
    API_KEY_SCOPE.ENGINE_READ,
    API_KEY_SCOPE.IMAGE_LOAD,
    API_KEY_SCOPE.JOB_READ,
    API_KEY_SCOPE.JOB_WRITE,
    API_KEY_SCOPE.SECRET_READ,
    API_KEY_SCOPE.SECRET_WRITE,
] as const

const apiKeyScopeSchema = z.enum(API_KEY_SCOPE_VALUES)

export const apiKeyCreateSchema = z.object({
    expiresInDays: z.number().int().min(1).max(365),
    name: z.string().trim().min(1).max(80),
    scopes: z
        .array(apiKeyScopeSchema)
        .min(1)
        .max(API_KEY_SCOPE_VALUES.length)
        .transform((scopes) => [...new Set(scopes)]),
})

export const apiKeySchema = z.object({
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    lastUsedAt: z.iso.datetime().nullable(),
    name: z.string(),
    prefix: z.string(),
    revokedAt: z.iso.datetime().nullable(),
    scopes: z.array(apiKeyScopeSchema),
})

export const apiKeyCreateResultSchema = apiKeySchema.extend({ token: z.string().min(40) })
export const apiKeyListSchema = z.array(apiKeySchema)

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>
