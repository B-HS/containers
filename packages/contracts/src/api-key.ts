import { z } from 'zod'

export const API_KEY_SCOPE = {
    ARTIFACT_READ: 'artifact:read',
    ARTIFACT_UPLOAD: 'artifact:upload',
    BACKUP_READ: 'backup:read',
    BACKUP_WRITE: 'backup:write',
    DEPLOYMENT_READ: 'deployment:read',
    DEPLOYMENT_WRITE: 'deployment:write',
    IMAGE_LOAD: 'image:load',
    SECRET_READ: 'secret:read',
    SECRET_WRITE: 'secret:write',
} as const

const apiKeyScopeSchema = z.enum([
    API_KEY_SCOPE.ARTIFACT_READ,
    API_KEY_SCOPE.ARTIFACT_UPLOAD,
    API_KEY_SCOPE.BACKUP_READ,
    API_KEY_SCOPE.BACKUP_WRITE,
    API_KEY_SCOPE.DEPLOYMENT_READ,
    API_KEY_SCOPE.DEPLOYMENT_WRITE,
    API_KEY_SCOPE.IMAGE_LOAD,
    API_KEY_SCOPE.SECRET_READ,
    API_KEY_SCOPE.SECRET_WRITE,
])

export const apiKeyCreateSchema = z.object({
    expiresInDays: z.number().int().min(1).max(365).nullable(),
    name: z.string().trim().min(1).max(80),
    scopes: z
        .array(apiKeyScopeSchema)
        .min(1)
        .max(9)
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
