import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { proxyAddressSchema, trustedProxyApproveSchema } from '@containers/contracts/trusted-proxy'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { authenticateScopeOrRole } from '../../lib/authenticate-scope-or-role'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { TrustedProxyService } from '../../service/domain/trusted-proxy/create-trusted-proxy-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const WRITE_ROLES = [USER_ROLE.OWNER]

const addressParamSchema = z.object({ address: proxyAddressSchema })

type TrustedProxyRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    trustedProxyService: Pick<TrustedProxyService, 'approve' | 'getState' | 'revoke'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createTrustedProxyRoute = ({ apiKeyService, auditService, authService, trustedProxyService }: TrustedProxyRouteDependencies) =>
    new Hono()
        .get(
            '/trusted-proxies',
            describeRoute({
                responses: { 200: { description: '승인된 프록시와 후보' } },
                summary: '신뢰 프록시 조회',
                tags: ['TrustedProxy'],
            }),
            withErrorHandling(async (context) => {
                await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    roles: READ_ROLES,
                    scope: API_KEY_SCOPE.TRUSTED_PROXY_READ,
                })
                return context.json(successResponse(await trustedProxyService.getState()), 200)
            }),
        )
        .post(
            '/trusted-proxies',
            describeRoute({
                responses: { 201: { description: '프록시 승인' } },
                summary: '신뢰 프록시 승인',
                tags: ['TrustedProxy'],
            }),
            validator('json', trustedProxyApproveSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof trustedProxyApproveSchema> }>) => {
                const payload = context.req.valid('json')
                const audit = {
                    operation: 'trusted-proxy.approve',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: payload.address,
                    targetType: 'trusted-proxy' as const,
                }
                const actor = await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                    roles: WRITE_ROLES,
                    scope: API_KEY_SCOPE.TRUSTED_PROXY_WRITE,
                })
                const actorId = actor.actorId
                await auditService.record({ ...audit, actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod, result: 'attempt' })
                try {
                    await trustedProxyService.approve(actorId, payload)
                    await auditService.record({ ...audit, actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod, result: 'success' })
                    return context.json(successResponse(await trustedProxyService.getState()), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'TRUSTED_PROXY_APPROVE_FAILED'
                    await auditService.record({
                        ...audit,
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { code },
                        result: 'failure',
                    })
                    throw error
                }
            }),
        )
        .delete(
            '/trusted-proxies/:address',
            describeRoute({
                responses: { 200: { description: '프록시 신뢰 해제' } },
                summary: '신뢰 프록시 해제',
                tags: ['TrustedProxy'],
            }),
            validator('param', addressParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof addressParamSchema> }>) => {
                const address = context.req.valid('param').address
                const audit = {
                    operation: 'trusted-proxy.revoke',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: address,
                    targetType: 'trusted-proxy' as const,
                }
                const actor = await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                    roles: WRITE_ROLES,
                    scope: API_KEY_SCOPE.TRUSTED_PROXY_WRITE,
                })
                const actorId = actor.actorId
                await auditService.record({ ...audit, actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod, result: 'attempt' })
                try {
                    await trustedProxyService.revoke(address)
                    await auditService.record({ ...audit, actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod, result: 'success' })
                    return context.json(successResponse(await trustedProxyService.getState()), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'TRUSTED_PROXY_REVOKE_FAILED'
                    await auditService.record({
                        ...audit,
                        actorId,
                        apiKeyId: actor.apiKeyId,
                        authMethod: actor.authMethod,
                        detail: { code },
                        result: 'failure',
                    })
                    throw error
                }
            }),
        )
