import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { HealthService } from '../../service/domain/health/create-health-service'

type HealthRouteDependencies = {
    healthService: HealthService
}

export const createHealthRoute = ({ healthService }: HealthRouteDependencies) =>
    new Hono().get(
        '/',
        describeRoute({
            responses: {
                200: { description: '정상 상태' },
            },
            summary: '서버 정상 상태 조회',
            tags: ['Health'],
        }),
        withErrorHandling((context) => context.json(successResponse(healthService.getHealth()), 200)),
    )
