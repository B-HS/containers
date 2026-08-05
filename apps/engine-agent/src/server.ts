import { z } from 'zod'
import { websocket } from 'hono/bun'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createAgentApp } from './compose/create-agent-app'
import { createServerDrain, createShutdownHandler, registerShutdownSignals } from './boot/create-shutdown-handler'

const SERVER_IDLE_TIMEOUT_SECONDS = 255
const SHUTDOWN_DRAIN_TIMEOUT_MS = 8 * 1_000

const env = parseEnv(
    z.object({
        AGENT_PORT: z.coerce.number().int().positive().default(3002),
        AGENT_SHARED_SECRET_FILE: z.string().min(1),
        ARTIFACT_ROOT: z.string().min(1),
        DOCKER_SOCKET_PATH: z.string().min(1).default('/var/run/docker.sock'),
        NGINX_CONFIG_ROOT: z.string().min(1),
        NGINX_REVISION_KEEP_COUNT: z.coerce.number().int().min(1).max(500).default(20),
        NGINX_STATUS_URL: z.url(),
        REGISTRY_CREDENTIAL_FILE: z.string().min(1).default('/credentials/registry-credentials.json'),
        REGISTRY_CREDENTIAL_KEY_FILE: z.string().min(1).default('/credentials/registry-credential-key'),
    }),
)

const app = createAgentApp({
    artifactRoot: env.ARTIFACT_ROOT,
    nginxConfigRoot: env.NGINX_CONFIG_ROOT,
    nginxRevisionKeepCount: env.NGINX_REVISION_KEEP_COUNT,
    nginxStatusUrl: env.NGINX_STATUS_URL,
    registryCredentialFile: env.REGISTRY_CREDENTIAL_FILE,
    registryCredentialSecret: await loadOrCreateSecret(env.REGISTRY_CREDENTIAL_KEY_FILE),
    sharedSecret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
    socketPath: env.DOCKER_SOCKET_PATH,
})

const server = Bun.serve({
    fetch: app.fetch,
    idleTimeout: SERVER_IDLE_TIMEOUT_SECONDS,
    port: env.AGENT_PORT,
    websocket,
})

registerShutdownSignals(
    createShutdownHandler({
        steps: [{ name: 'drain-http-server', run: createServerDrain({ server, timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS }) }],
    }),
)
