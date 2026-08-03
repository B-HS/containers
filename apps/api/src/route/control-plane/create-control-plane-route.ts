import { Hono } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { ControlPlaneStatusService } from '../../service/domain/control-plane/create-control-plane-status-service'

const CONTROL_PLANE_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type ControlPlaneRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    controlPlaneStatusService: Pick<ControlPlaneStatusService, 'getStatus'>
}

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    return 400 as const
}

export const createControlPlaneRoute = ({ authService, controlPlaneStatusService }: ControlPlaneRouteDependencies) =>
    new Hono().get('/control-plane/status', async (context) => {
        try {
            await authService.requireRole(context.req.raw.headers, CONTROL_PLANE_READ_ROLES)
            const status = await controlPlaneStatusService.getStatus()
            return context.json(successResponse(status), 200)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'CONTROL_PLANE_STATUS_FAILED'
            return context.json(errorResponse(code, 'control plane 상태를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
        }
    })
