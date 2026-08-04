import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { ControlPlaneStatusService } from '../../service/domain/control-plane/create-control-plane-status-service'

const CONTROL_PLANE_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type ControlPlaneRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    controlPlaneStatusService: Pick<ControlPlaneStatusService, 'getStatus'>
}

const toUnavailable = (error: unknown) => {
    const code = error instanceof Error ? error.message : ''
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED' || code === 'FORBIDDEN') {
        return error
    }
    return createAppError('CONTROL_PLANE_STATUS_FAILED')
}

export const createControlPlaneRoute = ({ authService, controlPlaneStatusService }: ControlPlaneRouteDependencies) =>
    new Hono().get(
        '/control-plane/status',
        describeRoute({
            responses: {
                200: { description: 'control plane 상태' },
            },
            summary: 'control plane 상태 조회',
            tags: ['ControlPlane'],
        }),
        withErrorHandling(async (context) => {
            await authService.requireRole(context.req.raw.headers, CONTROL_PLANE_READ_ROLES)
            try {
                return context.json(successResponse(await controlPlaneStatusService.getStatus()), 200)
            } catch (error) {
                throw toUnavailable(error)
            }
        }),
    )
