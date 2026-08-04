import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'

type EngineServiceDependencies = {
    engineAgentClient: EngineAgentClient
}

export const createEngineService = ({ engineAgentClient }: EngineServiceDependencies) => ({
    getContainer: async (containerId: string) => engineAgentClient.getContainer(containerId),
    getContainerLogs: async (containerId: string, input: unknown) => engineAgentClient.getContainerLogs(containerId, input),
    getContainers: async () => engineAgentClient.getContainers(),
    getOverview: async () => engineAgentClient.getOverview(),
})

export type EngineService = ReturnType<typeof createEngineService>
