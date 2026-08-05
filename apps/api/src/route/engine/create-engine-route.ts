import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { containerLogRequestSchema } from '@containers/contracts/engine'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { EngineService } from '../../service/domain/engine/create-engine-service'

type EngineRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    authService: Pick<AuthService, 'requireRole'>
    engineService: EngineService
}

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]

const containerIdParamSchema = z.object({ containerId: z.string().min(1) })

const withEngineFallback =
    (fallback: string) =>
    async <TResult>(action: () => Promise<TResult>): Promise<TResult> => {
        try {
            return await action()
        } catch (error) {
            const code = error instanceof Error ? error.message : ''
            if (code === 'AUTH_REQUIRED' || code === 'FORBIDDEN') {
                throw error
            }
            throw createAppError(fallback)
        }
    }

export const createEngineRoute = ({ apiKeyService, authService, engineService }: EngineRouteDependencies) => {
    const authenticateRead = async (headers: Headers) => {
        if (headers.has('authorization')) {
            await apiKeyService.authenticate(headers, API_KEY_SCOPE.ENGINE_READ)
            return
        }
        await authService.requireRole(headers, ALL_ROLES)
    }

    return new Hono()
        .get(
            '/system/engine',
            describeRoute({
                responses: {
                    200: { description: 'Docker Engine 개요' },
                },
                summary: 'Docker Engine 개요 조회',
                tags: ['Engine'],
            }),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers)
                return withEngineFallback('ENGINE_UNAVAILABLE')(async () => context.json(successResponse(await engineService.getOverview()), 200))
            }),
        )
        .get(
            '/containers',
            describeRoute({
                responses: {
                    200: { description: '컨테이너 목록' },
                },
                summary: '컨테이너 목록 조회',
                tags: ['Engine'],
            }),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers)
                return withEngineFallback('ENGINE_UNAVAILABLE')(async () => context.json(successResponse(await engineService.getContainers()), 200))
            }),
        )
        .get(
            '/containers/:containerId',
            describeRoute({
                responses: {
                    200: { description: '컨테이너 상세 상태' },
                },
                summary: '컨테이너 상세 상태 조회',
                tags: ['Engine'],
            }),
            validator('param', containerIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema> }>) => {
                await authenticateRead(context.req.raw.headers)
                const { containerId } = context.req.valid('param')
                return withEngineFallback('CONTAINER_INSPECT_FAILED')(async () =>
                    context.json(successResponse(await engineService.getContainer(containerId)), 200),
                )
            }),
        )
        .get(
            '/containers/:containerId/logs',
            describeRoute({
                responses: {
                    200: { description: '컨테이너 로그' },
                },
                summary: '컨테이너 로그 조회',
                tags: ['Engine'],
            }),
            validator('param', containerIdParamSchema),
            validator('query', containerLogRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema>; query: z.infer<typeof containerLogRequestSchema> }>,
                ) => {
                    await authenticateRead(context.req.raw.headers)
                    const { containerId } = context.req.valid('param')
                    return withEngineFallback('CONTAINER_LOGS_FAILED')(async () =>
                        context.json(successResponse(await engineService.getContainerLogs(containerId, context.req.valid('query'))), 200),
                    )
                },
            ),
        )
}
