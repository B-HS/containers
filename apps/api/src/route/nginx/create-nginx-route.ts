import { Hono } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { NginxService } from '../../service/domain/nginx/create-nginx-service'
import type { NginxProxyRouteService } from '../../service/domain/nginx/create-nginx-proxy-route-service'

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000

type NginxRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    nginxService: NginxService
    nginxProxyRouteService: Pick<NginxProxyRouteService, 'create' | 'list' | 'remove'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') {
        return 401 as const
    }
    if (code === 'FORBIDDEN') {
        return 403 as const
    }
    if (code === 'NGINX_CONFIG_CONFLICT') {
        return 409 as const
    }
    return 400 as const
}

export const createNginxRoute = ({ auditService, authService, nginxProxyRouteService, nginxService }: NginxRouteDependencies) =>
    new Hono()
        .get('/nginx/status', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await nginxService.getStatus()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NGINX_UNAVAILABLE'
                if (code === 'AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                }
                return context.json(errorResponse('NGINX_UNAVAILABLE', 'Nginx 상태를 조회할 수 없습니다.', context.get('requestId')), 503)
            }
        })
        .get('/nginx/config', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await nginxService.getConfig()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NGINX_CONFIG_READ_FAILED'
                return context.json(errorResponse(code, 'Nginx 설정을 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .get('/nginx/routes', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await nginxProxyRouteService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NGINX_ROUTE_READ_FAILED'
                return context.json(errorResponse(code, 'Nginx 프록시 라우트를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/nginx/routes', async (context) => {
            let actorId: string | undefined
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const input: unknown = await context.req.json()
                await auditService.record({
                    actorId,
                    operation: 'nginx.route.create',
                    requestId: context.get('requestId'),
                    result: 'attempt',
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'new',
                    targetType: 'nginx-route',
                })
                const result = await nginxProxyRouteService.create(input)
                await auditService.record({
                    actorId,
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
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'nginx.route.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'new',
                        targetType: 'nginx-route',
                    })
                }
                return context.json(errorResponse(code, 'Nginx 프록시 라우트를 생성할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .delete('/nginx/routes/:id', async (context) => {
            let actorId: string | undefined
            const targetId = context.req.param('id')
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const input = (await context.req.json()) as { confirmation?: unknown }
                await auditService.record({
                    actorId,
                    operation: 'nginx.route.remove',
                    requestId: context.get('requestId'),
                    result: 'attempt',
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'nginx-route',
                })
                const result = await nginxProxyRouteService.remove(targetId, typeof input.confirmation === 'string' ? input.confirmation : '')
                await auditService.record({
                    actorId,
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
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'nginx.route.remove',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'nginx-route',
                    })
                }
                return context.json(errorResponse(code, 'Nginx 프록시 라우트를 삭제할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/nginx/config/apply', async (context) => {
            let actorId: string | undefined
            const audit = {
                operation: 'nginx.config.apply',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: 'current',
                targetType: 'nginx-config' as const,
            }
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                await auditService.record({ ...audit, actorId, result: 'attempt' })
                const result = await nginxService.applyConfig(await context.req.json())
                await auditService.record({ ...audit, actorId, detail: { sha256: result.sha256 }, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NGINX_CONFIG_APPLY_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, detail: { code: code.slice(0, 512) }, result: 'failure' })
                }
                return context.json(
                    errorResponse(code.split(':')[0] ?? code, 'Nginx 설정을 적용할 수 없습니다.', context.get('requestId')),
                    errorStatus(code),
                )
            }
        })
