import { Hono } from 'hono'
import { SERVICE_STATUS } from '@containers/contracts/health'
import type { AgentHealthService } from '../service/create-agent-health-service'

type AgentHealthRouteDependencies = {
    agentHealthService: AgentHealthService
}

export const createAgentHealthRoute = ({ agentHealthService }: AgentHealthRouteDependencies) =>
    new Hono().get('/', async (context) => {
        const health = await agentHealthService.getHealth()

        if (health.status === SERVICE_STATUS.DEGRADED) {
            return context.json(health, 503)
        }

        return context.json(health, 200)
    })
