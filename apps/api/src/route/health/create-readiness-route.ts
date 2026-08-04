import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { SERVICE_STATUS } from '@containers/contracts/health'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import { toReadinessSummary, type ReadinessService } from '../../service/domain/health/create-readiness-service'

const READINESS_DETAIL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type ReadinessRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    authService: Pick<AuthService, 'requireRole'>
    readinessService: Pick<ReadinessService, 'getReadiness'>
}

export const createReadinessRoute = ({ apiKeyService, authService, readinessService }: ReadinessRouteDependencies) => {
    const isDetailAllowed = async (headers: Headers) => {
        try {
            if (headers.has('authorization')) {
                await apiKeyService.authenticate(headers, API_KEY_SCOPE.CONTROL_PLANE_READ)
                return true
            }
            await authService.requireRole(headers, READINESS_DETAIL_ROLES)
            return true
        } catch {
            return false
        }
    }

    return new Hono().get(
        '/readyz',
        describeRoute({
            responses: {
                200: { description: '모든 의존 구성요소 정상' },
                503: { description: '하나 이상의 구성요소가 degraded' },
            },
            summary: 'control plane 준비 상태 조회',
            tags: ['Health'],
        }),
        withErrorHandling(async (context) => {
            const readiness = await readinessService.getReadiness()
            const detailed = await isDetailAllowed(context.req.raw.headers)
            return context.json(
                successResponse(detailed ? readiness : toReadinessSummary(readiness)),
                readiness.status === SERVICE_STATUS.DEGRADED ? 503 : 200,
            )
        }),
    )
}
