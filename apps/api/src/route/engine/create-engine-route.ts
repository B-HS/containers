import { Hono } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { EngineService } from '../../service/domain/engine/create-engine-service'

type EngineRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    engineService: EngineService
}

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]

const statusForError = (code: string) => (code === 'AUTH_REQUIRED' ? (401 as const) : code === 'FORBIDDEN' ? (403 as const) : (503 as const))
const publicCode = (code: string, fallback: string) => (code === 'AUTH_REQUIRED' || code === 'FORBIDDEN' ? code : fallback)

export const createEngineRoute = ({ authService, engineService }: EngineRouteDependencies) =>
    new Hono()
        .get('/system/engine', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await engineService.getOverview()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'ENGINE_UNAVAILABLE'
                return context.json(
                    errorResponse(publicCode(code, 'ENGINE_UNAVAILABLE'), 'Docker Engine 상태를 조회할 수 없습니다.', context.get('requestId')),
                    statusForError(code),
                )
            }
        })
        .get('/containers', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await engineService.getContainers()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'ENGINE_UNAVAILABLE'
                return context.json(
                    errorResponse(publicCode(code, 'ENGINE_UNAVAILABLE'), '컨테이너 목록을 조회할 수 없습니다.', context.get('requestId')),
                    statusForError(code),
                )
            }
        })
        .get('/containers/:containerId', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await engineService.getContainer(context.req.param('containerId'))), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTAINER_INSPECT_FAILED'
                return context.json(
                    errorResponse(publicCode(code, 'CONTAINER_INSPECT_FAILED'), '컨테이너 상세 상태를 조회할 수 없습니다.', context.get('requestId')),
                    statusForError(code),
                )
            }
        })
        .get('/containers/:containerId/logs', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await engineService.getContainerLogs(context.req.param('containerId'), context.req.query())), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTAINER_LOGS_FAILED'
                return context.json(
                    errorResponse(publicCode(code, 'CONTAINER_LOGS_FAILED'), '컨테이너 로그를 조회할 수 없습니다.', context.get('requestId')),
                    statusForError(code),
                )
            }
        })
