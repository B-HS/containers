import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import type { NginxStatusClient } from '../../../service/shared/nginx/create-nginx-status-client'

type NginxServiceDependencies = {
    engineAgentClient: Pick<EngineAgentClient, 'applyNginxConfig' | 'getNginxConfig'>
    nginxStatusClient: NginxStatusClient
}

export const createNginxService = ({ engineAgentClient, nginxStatusClient }: NginxServiceDependencies) => ({
    applyConfig: async (input: unknown) => engineAgentClient.applyNginxConfig(input),
    getConfig: async () => engineAgentClient.getNginxConfig(),
    getStatus: async () => nginxStatusClient.getStatus(),
})

export type NginxService = ReturnType<typeof createNginxService>
