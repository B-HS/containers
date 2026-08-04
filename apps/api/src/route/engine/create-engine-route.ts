import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { containerLogRequestSchema } from '@containers/contracts/engine'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { EngineService } from '../../service/domain/engine/create-engine-service'

type EngineRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    engineService: EngineService
}

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]

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

export const createEngineRoute = ({ authService, engineService }: EngineRouteDependencies) =>
    new Hono()
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
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
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
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
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
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return withEngineFallback('CONTAINER_INSPECT_FAILED')(async () =>
                    context.json(successResponse(await engineService.getContainer(context.req.param('containerId'))), 200),
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
            validator('query', containerLogRequestSchema),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return withEngineFallback('CONTAINER_LOGS_FAILED')(async () =>
                    context.json(
                        successResponse(await engineService.getContainerLogs(context.req.param('containerId'), context.req.valid('query'))),
                        200,
                    ),
                )
            }),
        )
