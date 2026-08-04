import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { SERVICE_STATUS } from '@containers/contracts/health'
import type { AgentHealthService } from '../service/create-agent-health-service'
import { withErrorHandling } from '../lib/with-error-handling'

type AgentHealthRouteDependencies = {
    agentHealthService: AgentHealthService
}

export const createAgentHealthRoute = ({ agentHealthService }: AgentHealthRouteDependencies) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['agent-health'],
            summary: '엔진 에이전트 상태 조회',
            responses: { 200: { description: '정상' } },
        }),
        withErrorHandling(async (context) => {
            const health = await agentHealthService.getHealth()
            return context.json(health, health.status === SERVICE_STATUS.DEGRADED ? 503 : 200)
        }),
    )

    return route
}
