import { Hono } from 'hono'
import { createDockerEngineClient } from '../service/shared/create-docker-engine-client'
import { createInternalAuthMiddleware } from '../middleware/create-internal-auth-middleware'
import { createAgentHealthRoute } from '../route/create-agent-health-route'
import { createEngineControlRoute } from '../route/create-engine-control-route'
import { createEngineQueryRoute } from '../route/create-engine-query-route'
import { createEngineStreamRoute } from '../route/create-engine-stream-route'
import { createNginxConfigRoute } from '../route/create-nginx-config-route'
import { createRegistryCredentialRoute } from '../route/create-registry-credential-route'
import { createInteractiveExecRoute } from '../route/create-interactive-exec-route'
import { createAgentHealthService } from '../service/domain/create-agent-health-service'
import { createEngineControlService } from '../service/domain/create-engine-control-service'
import { createEngineQueryService } from '../service/domain/create-engine-query-service'
import { createEngineStreamService } from '../service/domain/create-engine-stream-service'
import { createNginxConfigService } from '../service/domain/create-nginx-config-service'
import { createRegistryCredentialService } from '../service/domain/create-registry-credential-service'
import { createInteractiveExecService } from '../service/domain/create-interactive-exec-service'

type AgentAppDependencies = {
    artifactRoot: string
    nginxConfigRoot: string
    nginxRevisionKeepCount: number
    nginxStatusUrl: string
    registryCredentialFile: string
    registryCredentialSecret: string
    sharedSecret: string
    socketPath: string
}

export const createAgentApp = ({
    artifactRoot,
    nginxConfigRoot,
    nginxRevisionKeepCount,
    nginxStatusUrl,
    registryCredentialFile,
    registryCredentialSecret,
    sharedSecret,
    socketPath,
}: AgentAppDependencies) => {
    const dockerEngineClient = createDockerEngineClient({ socketPath })
    const agentHealthService = createAgentHealthService({ dockerEngineClient, now: () => new Date() })
    const agentHealthRoute = createAgentHealthRoute({ agentHealthService })
    const engineQueryService = createEngineQueryService({ artifactRoot, dockerEngineClient })
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
        revisionKeepCount: nginxRevisionKeepCount,
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
