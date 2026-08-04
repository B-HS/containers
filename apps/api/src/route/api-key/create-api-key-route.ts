import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { apiKeyCreateSchema } from '@containers/contracts/api-key'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

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
            withErrorHandling(async (context) => {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                return context.json(successResponse(await apiKeyService.create(session.user.id, context.req.valid('json'))), 201)
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
            withErrorHandling(async (context) => {
                await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const { id } = context.req.valid('param' as never) as z.infer<typeof apiKeyIdSchema>
                return context.json(successResponse(await apiKeyService.revoke(id)), 200)
            }),
        )
