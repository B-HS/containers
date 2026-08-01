import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'
import type { DockerEngineClient } from '../docker/create-docker-engine-client'

type AgentHealthServiceDependencies = {
    dockerEngineClient: Pick<DockerEngineClient, 'getVersion'>
    now: () => Date
}

export const createAgentHealthService = ({ dockerEngineClient, now }: AgentHealthServiceDependencies) => ({
    getHealth: async () => {
        try {
            await dockerEngineClient.getVersion()

            return healthSchema.parse({
                service: 'engine-agent',
                status: SERVICE_STATUS.OK,
                timestamp: now().toISOString(),
                version: '0.1.0',
            })
        } catch {
            return healthSchema.parse({
                service: 'engine-agent',
                status: SERVICE_STATUS.DEGRADED,
                timestamp: now().toISOString(),
                version: '0.1.0',
            })
        }
    },
})

export type AgentHealthService = ReturnType<typeof createAgentHealthService>
