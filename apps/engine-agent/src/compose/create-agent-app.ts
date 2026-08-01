import { Hono } from 'hono'
import { statfs } from 'node:fs/promises'
import { createDockerEngineClient } from '../docker/create-docker-engine-client'
import { createInternalAuthMiddleware } from '../middleware/create-internal-auth-middleware'
import { createAgentHealthRoute } from '../route/create-agent-health-route'
import { createEngineControlRoute } from '../route/create-engine-control-route'
import { createEngineQueryRoute } from '../route/create-engine-query-route'
import { createEngineStreamRoute } from '../route/create-engine-stream-route'
import { createNginxConfigRoute } from '../route/create-nginx-config-route'
import { createRegistryCredentialRoute } from '../route/create-registry-credential-route'
import { createInteractiveExecRoute } from '../route/create-interactive-exec-route'
import { createAgentHealthService } from '../service/create-agent-health-service'
import { createEngineControlService } from '../service/create-engine-control-service'
import { createEngineQueryService } from '../service/create-engine-query-service'
import { createEngineStreamService } from '../service/create-engine-stream-service'
import { createNginxConfigService } from '../service/create-nginx-config-service'
import { createRegistryCredentialService } from '../service/create-registry-credential-service'
import { createInteractiveExecService } from '../service/create-interactive-exec-service'

type AgentAppDependencies = {
    artifactRoot: string
    nginxConfigRoot: string
    nginxStatusUrl: string
    registryCredentialFile: string
    registryCredentialSecret: string
    sharedSecret: string
    socketPath: string
}

export const createAgentApp = ({
    artifactRoot,
    nginxConfigRoot,
    nginxStatusUrl,
    registryCredentialFile,
    registryCredentialSecret,
    sharedSecret,
    socketPath,
}: AgentAppDependencies) => {
    const dockerEngineClient = createDockerEngineClient({ socketPath })
    const agentHealthService = createAgentHealthService({ dockerEngineClient, now: () => new Date() })
    const agentHealthRoute = createAgentHealthRoute({ agentHealthService })
    const engineQueryService = createEngineQueryService({
        dockerEngineClient,
        getFilesystemUsage: async () => {
            const filesystem = await statfs('/')
            const capacityBytes = filesystem.blocks * filesystem.bsize
            const availableBytes = filesystem.bavail * filesystem.bsize

            return {
                availableBytes,
                capacityBytes,
                usedBytes: capacityBytes - filesystem.bfree * filesystem.bsize,
            }
        },
    })
    const engineQueryRoute = createEngineQueryRoute({ engineQueryService })
    const registryCredentialService = createRegistryCredentialService({
        filePath: registryCredentialFile,
        masterSecret: registryCredentialSecret,
        now: () => new Date(),
    })
    const registryCredentialRoute = createRegistryCredentialRoute({ registryCredentialService })
    const engineControlService = createEngineControlService({ artifactRoot, dockerEngineClient, registryCredentialService })
    const engineControlRoute = createEngineControlRoute({ engineControlService })
    const engineStreamService = createEngineStreamService({ dockerEngineClient, now: () => new Date() })
    const engineStreamRoute = createEngineStreamRoute({ engineStreamService })
    const interactiveExecService = createInteractiveExecService({ dockerEngineClient, now: () => new Date() })
    const interactiveExecRoute = createInteractiveExecRoute({ interactiveExecService })
    const nginxConfigService = createNginxConfigService({
        configRoot: nginxConfigRoot,
        dockerEngineClient,
        now: () => new Date(),
        statusUrl: nginxStatusUrl,
    })
    const nginxConfigRoute = createNginxConfigRoute({ nginxConfigService })

    return new Hono()
        .route('/health', agentHealthRoute)
        .use('/v1/*', createInternalAuthMiddleware({ now: Date.now, secret: sharedSecret }))
        .route('/', interactiveExecRoute)
        .route('/v1', engineQueryRoute)
        .route('/v1', engineControlRoute)
        .route('/v1', registryCredentialRoute)
        .route('/v1', engineStreamRoute)
        .route('/v1', nginxConfigRoute)
}
