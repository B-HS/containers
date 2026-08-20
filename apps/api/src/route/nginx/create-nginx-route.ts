import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { nginxConfigApplySchema, nginxProxyRouteInputSchema } from '@containers/contracts/nginx'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { authenticateScopeOrRole } from '../../lib/authenticate-scope-or-role'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { NginxService } from '../../service/domain/nginx/create-nginx-service'
import type { NginxProxyRouteService } from '../../service/domain/nginx/create-nginx-proxy-route-service'

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const nginxRouteIdParamSchema = z.object({ id: z.uuid() })
const nginxRouteRemoveSchema = z.object({ confirmation: z.string().min(1).max(256) })

type NginxRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    nginxService: NginxService
    nginxProxyRouteService: Pick<NginxProxyRouteService, 'create' | 'list' | 'remove' | 'update'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createNginxRoute = ({ apiKeyService, auditService, authService, nginxProxyRouteService, nginxService }: NginxRouteDependencies) =>
    new Hono()
        .get(
            '/nginx/status',
            describeRoute({
                responses: { 200: { description: 'Nginx 상태' } },
                summary: 'Nginx 상태 조회',
                tags: ['Nginx'],
            }),
            withErrorHandling(async (context) => {
                await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    roles: ALL_ROLES,
                    scope: API_KEY_SCOPE.NGINX_READ,
                })
                return context.json(successResponse(await nginxService.getStatus()), 200)
            }),
        )
        .get(
            '/nginx/config',
            describeRoute({
                responses: { 200: { description: 'Nginx 설정' } },
                summary: 'Nginx 설정 조회',
                tags: ['Nginx'],
            }),
            withErrorHandling(async (context) => {
                await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    roles: ALL_ROLES,
                    scope: API_KEY_SCOPE.NGINX_READ,
                })
                return context.json(successResponse(await nginxService.getConfig()), 200)
            }),
        )
        .get(
            '/nginx/routes',
            describeRoute({
                responses: { 200: { description: 'Nginx 프록시 라우트 목록' } },
                summary: 'Nginx 프록시 라우트 목록 조회',
                tags: ['Nginx'],
            }),
            withErrorHandling(async (context) => {
                await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    roles: ALL_ROLES,
                    scope: API_KEY_SCOPE.NGINX_READ,
                })
                return context.json(successResponse(await nginxProxyRouteService.list()), 200)
            }),
        )
        .post(
            '/nginx/routes',
            describeRoute({
                responses: { 201: { description: 'Nginx 프록시 라우트 생성' } },
                summary: 'Nginx 프록시 라우트 생성',
                tags: ['Nginx'],
            }),
            validator('json', nginxProxyRouteInputSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof nginxProxyRouteInputSchema> }>) => {
                const actor = await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                    roles: ADMIN_ROLES,
                    scope: API_KEY_SCOPE.NGINX_WRITE,
                })
                const actorId = actor.actorId
                const input = context.req.valid('json')
                await auditService.record({
                    actorId,
                    apiKeyId: actor.apiKeyId,
                    authMethod: actor.authMethod,
                    operation: 'nginx.route.create',
                    requestId: context.get('requestId'),
                    result: 'attempt',
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'new',
                    targetType: 'nginx-route',
                })
                try {
                    const result = await nginxProxyRouteService.create(input)
                    await auditService.record({
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { configSha256: result.configSha256 },
                        operation: 'nginx.route.create',
                        requestId: context.get('requestId'),
                        result: 'success',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: result.route.id,
                        targetType: 'nginx-route',
                    })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NGINX_ROUTE_CREATE_FAILED'
                    await auditService.record({
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { code },
                        operation: 'nginx.route.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'new',
                        targetType: 'nginx-route',
                    })
                    throw error
                }
            }),
        )
        .put(
            '/nginx/routes/:id',
            describeRoute({
                responses: { 200: { description: 'Nginx 프록시 라우트 수정' } },
                summary: 'Nginx 프록시 라우트 수정',
                tags: ['Nginx'],
            }),
            validator('param', nginxRouteIdParamSchema),
            validator('json', nginxProxyRouteInputSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{ param: z.infer<typeof nginxRouteIdParamSchema>; json: z.infer<typeof nginxProxyRouteInputSchema> }>,
                ) => {
                    const targetId = context.req.valid('param').id
                    const input = context.req.valid('json')
                    const actor = await authenticateScopeOrRole({
                        apiKeyService,
                        authService,
                        headers: context.req.raw.headers,
                        recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                        roles: ADMIN_ROLES,
                        scope: API_KEY_SCOPE.NGINX_WRITE,
                    })
                    const actorId = actor.actorId
                    await auditService.record({
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        operation: 'nginx.route.update',
                        requestId: context.get('requestId'),
                        result: 'attempt',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'nginx-route',
                    })
                    try {
                        const result = await nginxProxyRouteService.update(targetId, input)
                        await auditService.record({
                            actorId,
                            apiKeyId: actor.apiKeyId,
                            authMethod: actor.authMethod,
                            detail: { configSha256: result.configSha256, enabled: result.route.enabled, hostname: result.route.hostname },
                            operation: 'nginx.route.update',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'nginx-route',
                        })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'NGINX_ROUTE_UPDATE_FAILED'
                        await auditService.record({
                            actorId,
                            apiKeyId: actor.apiKeyId,
                            authMethod: actor.authMethod,
                            detail: { code },
                            operation: 'nginx.route.update',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'nginx-route',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/nginx/routes/:id',
            describeRoute({
                responses: { 200: { description: 'Nginx 프록시 라우트 삭제' } },
                summary: 'Nginx 프록시 라우트 삭제',
                tags: ['Nginx'],
            }),
            validator('param', nginxRouteIdParamSchema),
            validator('json', nginxRouteRemoveSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{ param: z.infer<typeof nginxRouteIdParamSchema>; json: z.infer<typeof nginxRouteRemoveSchema> }>,
                ) => {
                    const targetId = context.req.valid('param').id
                    const confirmation = context.req.valid('json').confirmation
                    const actor = await authenticateScopeOrRole({
                        apiKeyService,
                        authService,
                        headers: context.req.raw.headers,
                        recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                        roles: ADMIN_ROLES,
                        scope: API_KEY_SCOPE.NGINX_WRITE,
                    })
                    const actorId = actor.actorId
                    await auditService.record({
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        operation: 'nginx.route.remove',
                        requestId: context.get('requestId'),
                        result: 'attempt',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'nginx-route',
                    })
                    try {
                        const result = await nginxProxyRouteService.remove(targetId, confirmation)
                        await auditService.record({
                            actorId,
                            apiKeyId: actor.apiKeyId,
                            authMethod: actor.authMethod,
                            detail: { configSha256: result.configSha256 },
                            operation: 'nginx.route.remove',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'nginx-route',
                        })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'NGINX_ROUTE_REMOVE_FAILED'
                        await auditService.record({
                            actorId,
                            apiKeyId: actor.apiKeyId,
                            authMethod: actor.authMethod,
                            detail: { code },
                            operation: 'nginx.route.remove',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'nginx-route',
                        })
                        throw error
                    }
                },
            ),
        )
        .post(
            '/nginx/config/apply',
            describeRoute({
                responses: { 200: { description: 'Nginx 설정 적용' } },
                summary: 'Nginx 설정 적용',
                tags: ['Nginx'],
            }),
            validator('json', nginxConfigApplySchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof nginxConfigApplySchema> }>) => {
                const audit = {
                    operation: 'nginx.config.apply',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'current',
                    targetType: 'nginx-config' as const,
                }
                const actor = await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                    roles: ADMIN_ROLES,
                    scope: API_KEY_SCOPE.NGINX_WRITE,
                })
                const actorId = actor.actorId
                await auditService.record({ ...audit, actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod, result: 'attempt' })
                try {
                    const result = await nginxService.applyConfig(context.req.valid('json'))
                    await auditService.record({
                        ...audit,
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { sha256: result.sha256 },
                        result: 'success',
                    })
                    return context.json(successResponse(result), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NGINX_CONFIG_APPLY_FAILED'
                    await auditService.record({
                        ...audit,
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { code: code.slice(0, 512) },
                        result: 'failure',
                    })
                    throw error
                }
            }),
        )
