import { Hono } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type ApiKeyRouteDependencies = {
    apiKeyService: ApiKeyService
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
}

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') {
        return 401 as const
    }
    if (code === 'FORBIDDEN') {
        return 403 as const
    }
    if (code === 'API_KEY_NOT_FOUND') {
        return 404 as const
    }
    return 400 as const
}

export const createApiKeyRoute = ({ apiKeyService, authService }: ApiKeyRouteDependencies) =>
    new Hono()
        .get('/api-keys', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(successResponse(await apiKeyService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'API_KEY_LIST_FAILED'
                return context.json(errorResponse(code, 'API 키를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/api-keys', async (context) => {
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                return context.json(successResponse(await apiKeyService.create(session.user.id, await context.req.json())), 201)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'API_KEY_CREATE_FAILED'
                return context.json(errorResponse(code, 'API 키를 생성할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .delete('/api-keys/:id', async (context) => {
            try {
                await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                return context.json(successResponse(await apiKeyService.revoke(context.req.param('id'))), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'API_KEY_REVOKE_FAILED'
                return context.json(errorResponse(code, 'API 키를 폐기할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
