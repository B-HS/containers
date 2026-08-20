import { z } from 'zod'

export const API_KEY_SCOPE = {
    ARTIFACT_READ: 'artifact:read',
    ARTIFACT_UPLOAD: 'artifact:upload',
    ARTIFACT_WRITE: 'artifact:write',
    AUDIT_READ: 'audit:read',
    BACKUP_READ: 'backup:read',
    BACKUP_RESTORE: 'backup:restore',
    BACKUP_WRITE: 'backup:write',
    CONTAINER_WRITE: 'container:write',
    CONTROL_PLANE_READ: 'control-plane:read',
    DEPLOYMENT_READ: 'deployment:read',
    DEPLOYMENT_WRITE: 'deployment:write',
    ENGINE_READ: 'engine:read',
    IMAGE_LOAD: 'image:load',
    IMAGE_WRITE: 'image:write',
    JOB_READ: 'job:read',
    JOB_WRITE: 'job:write',
    MAINTENANCE_READ: 'maintenance:read',
    MAINTENANCE_WRITE: 'maintenance:write',
    NETWORK_WRITE: 'network:write',
    NGINX_READ: 'nginx:read',
    NGINX_WRITE: 'nginx:write',
    NOTIFICATION_READ: 'notification:read',
    NOTIFICATION_WRITE: 'notification:write',
    PANEL_SETTING_READ: 'panel-setting:read',
    PANEL_SETTING_WRITE: 'panel-setting:write',
    REGISTRY_CREDENTIAL_READ: 'registry-credential:read',
    REGISTRY_CREDENTIAL_WRITE: 'registry-credential:write',
    SECRET_READ: 'secret:read',
    SECRET_WRITE: 'secret:write',
    SYSTEM_PRUNE: 'system:prune',
    TRAFFIC_EXPORT: 'traffic:export',
    TRAFFIC_READ: 'traffic:read',
    TRUSTED_PROXY_READ: 'trusted-proxy:read',
    TRUSTED_PROXY_WRITE: 'trusted-proxy:write',
    VOLUME_WRITE: 'volume:write',
} as const

export const API_KEY_SCOPE_VALUES = [
    API_KEY_SCOPE.ARTIFACT_READ,
    API_KEY_SCOPE.ARTIFACT_UPLOAD,
    API_KEY_SCOPE.ARTIFACT_WRITE,
    API_KEY_SCOPE.AUDIT_READ,
    API_KEY_SCOPE.BACKUP_READ,
    API_KEY_SCOPE.BACKUP_RESTORE,
    API_KEY_SCOPE.BACKUP_WRITE,
    API_KEY_SCOPE.CONTAINER_WRITE,
    API_KEY_SCOPE.CONTROL_PLANE_READ,
    API_KEY_SCOPE.DEPLOYMENT_READ,
    API_KEY_SCOPE.DEPLOYMENT_WRITE,
    API_KEY_SCOPE.ENGINE_READ,
    API_KEY_SCOPE.IMAGE_LOAD,
    API_KEY_SCOPE.IMAGE_WRITE,
    API_KEY_SCOPE.JOB_READ,
    API_KEY_SCOPE.JOB_WRITE,
    API_KEY_SCOPE.MAINTENANCE_READ,
    API_KEY_SCOPE.MAINTENANCE_WRITE,
    API_KEY_SCOPE.NETWORK_WRITE,
    API_KEY_SCOPE.NGINX_READ,
    API_KEY_SCOPE.NGINX_WRITE,
    API_KEY_SCOPE.NOTIFICATION_READ,
    API_KEY_SCOPE.NOTIFICATION_WRITE,
    API_KEY_SCOPE.PANEL_SETTING_READ,
    API_KEY_SCOPE.PANEL_SETTING_WRITE,
    API_KEY_SCOPE.REGISTRY_CREDENTIAL_READ,
    API_KEY_SCOPE.REGISTRY_CREDENTIAL_WRITE,
    API_KEY_SCOPE.SECRET_READ,
    API_KEY_SCOPE.SECRET_WRITE,
    API_KEY_SCOPE.SYSTEM_PRUNE,
    API_KEY_SCOPE.TRAFFIC_EXPORT,
    API_KEY_SCOPE.TRAFFIC_READ,
    API_KEY_SCOPE.TRUSTED_PROXY_READ,
    API_KEY_SCOPE.TRUSTED_PROXY_WRITE,
    API_KEY_SCOPE.VOLUME_WRITE,
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
