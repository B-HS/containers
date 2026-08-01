import { Hono } from 'hono'
import { successResponse } from '../../lib/response'
import type { HealthService } from '../../service/domain/health/create-health-service'

type HealthRouteDependencies = {
    healthService: HealthService
}

export const createHealthRoute = ({ healthService }: HealthRouteDependencies) =>
    new Hono().get('/', (context) => context.json(successResponse(healthService.getHealth()), 200))
