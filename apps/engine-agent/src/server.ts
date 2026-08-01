import { z } from 'zod'
import { websocket } from 'hono/bun'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createAgentApp } from './compose/create-agent-app'

const env = parseEnv(
    z.object({
        AGENT_PORT: z.coerce.number().int().positive().default(3002),
        AGENT_SHARED_SECRET_FILE: z.string().min(1),
        ARTIFACT_ROOT: z.string().min(1),
        DOCKER_SOCKET_PATH: z.string().min(1).default('/var/run/docker.sock'),
        NGINX_CONFIG_ROOT: z.string().min(1),
        NGINX_STATUS_URL: z.url(),
        REGISTRY_CREDENTIAL_FILE: z.string().min(1).default('/credentials/registry-credentials.json'),
        REGISTRY_CREDENTIAL_KEY_FILE: z.string().min(1).default('/credentials/registry-credential-key'),
    }),
)

const app = createAgentApp({
    artifactRoot: env.ARTIFACT_ROOT,
    nginxConfigRoot: env.NGINX_CONFIG_ROOT,
    nginxStatusUrl: env.NGINX_STATUS_URL,
    registryCredentialFile: env.REGISTRY_CREDENTIAL_FILE,
    registryCredentialSecret: await loadOrCreateSecret(env.REGISTRY_CREDENTIAL_KEY_FILE),
    sharedSecret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
    socketPath: env.DOCKER_SOCKET_PATH,
})

export default {
    fetch: app.fetch,
    idleTimeout: 255,
    port: env.AGENT_PORT,
    websocket,
}
