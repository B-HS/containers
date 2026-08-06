import { z } from 'zod'

export const nginxStatusSchema = z.object({
    acceptedConnections: z.number().int().nonnegative(),
    activeConnections: z.number().int().nonnegative(),
    handledConnections: z.number().int().nonnegative(),
    readingConnections: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    waitingConnections: z.number().int().nonnegative(),
    writingConnections: z.number().int().nonnegative(),
})

export const nginxConfigApplySchema = z.object({
    config: z.string().min(1).max(1_048_576),
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const nginxConfigRevisionSchema = z.object({
    createdAt: z.iso.datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const nginxConfigStateSchema = z.object({
    config: z.string(),
    history: z.array(nginxConfigRevisionSchema),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const nginxConfigApplyResultSchema = z.object({
    appliedAt: z.iso.datetime(),
    previousSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    validationOutput: z.string(),
})

const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const protectedSuffix = /(^|\.)containers\.local$/
const routePathPattern = /^\/(?:[A-Za-z0-9._~!&'()*+,=:@%/-]*)$/
const containerTargetPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export const nginxProxyRouteInputSchema = z.object({
    bodySizeMegabytes: z.number().int().min(1).max(1024).default(64),
    enabled: z.boolean().default(true),
    hostname: z
        .string()
        .trim()
        .toLowerCase()
        .regex(hostnamePattern)
        .refine((value) => !protectedSuffix.test(value), { message: '보호된 도메인 접미사는 허용되지 않습니다.' }),
    path: z.string().trim().regex(routePathPattern).default('/'),
    pathMode: z.enum(['exact', 'prefix']).default('prefix'),
    protocol: z.enum(['http', 'websocket']).default('http'),
    stripPrefix: z.boolean().default(false),
    targetContainer: z.string().trim().regex(containerTargetPattern),
    targetPort: z.number().int().min(1).max(65_535),
    timeoutSeconds: z.number().int().min(1).max(3600).default(60),
})

export const nginxProxyRouteSchema = nginxProxyRouteInputSchema.extend({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    managedBy: z.string().nullable(),
    updatedAt: z.iso.datetime(),
})

export const nginxProxyRouteListSchema = z.array(nginxProxyRouteSchema)

export const nginxProxyRouteMutationResultSchema = z.object({
    configSha256: z.string().regex(/^[a-f0-9]{64}$/),
    route: nginxProxyRouteSchema,
})

export type NginxProxyRoute = z.infer<typeof nginxProxyRouteSchema>
