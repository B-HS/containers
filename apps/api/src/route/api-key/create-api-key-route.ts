import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { apiKeyCreateSchema } from '@containers/contracts/api-key'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import { requiresOwnerApiKeyScope, type ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const OWNER_ROLES = [USER_ROLE.OWNER]

const apiKeyIdSchema = z.object({ id: z.uuid() })

type ApiKeyRouteDependencies = {
    apiKeyService: ApiKeyService
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
}

export const createApiKeyRoute = ({ apiKeyService, authService }: ApiKeyRouteDependencies) =>
    new Hono()
        .get(
            '/api-keys',
            describeRoute({
                responses: { 200: { description: 'API 키 목록' } },
                summary: 'API 키 목록 조회',
                tags: ['ApiKey'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(successResponse(await apiKeyService.list()), 200)
            }),
        )
        .post(
            '/api-keys',
            describeRoute({
                responses: { 201: { description: 'API 키 생성' } },
                summary: 'API 키 생성',
                tags: ['ApiKey'],
            }),
            validator('json', apiKeyCreateSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof apiKeyCreateSchema> }>) => {
                const payload = context.req.valid('json')
                const allowedRoles = requiresOwnerApiKeyScope(payload.scopes) ? OWNER_ROLES : ADMIN_ROLES
                const session = await authService.requireRecentRole(context.req.raw.headers, allowedRoles, RECENT_AUTH_MAX_AGE_MS)
                return context.json(successResponse(await apiKeyService.create({ id: session.user.id, role: session.role }, payload)), 201)
            }),
        )
        .delete(
            '/api-keys/:id',
            describeRoute({
                responses: { 200: { description: 'API 키 폐기' } },
                summary: 'API 키 폐기',
                tags: ['ApiKey'],
            }),
            validator('param', apiKeyIdSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof apiKeyIdSchema> }>) => {
                await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const { id } = context.req.valid('param')
                return context.json(successResponse(await apiKeyService.revoke(id)), 200)
            }),
        )
