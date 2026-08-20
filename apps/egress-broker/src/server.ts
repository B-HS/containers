import { z } from 'zod'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createEgressApp } from './compose/create-egress-app'
import { createEgressService } from './service/domain/create-egress-service'
import { createServerDrain, createShutdownHandler, registerShutdownSignals } from './boot/create-shutdown-handler'

const SHUTDOWN_DRAIN_TIMEOUT_MS = 8 * 1_000

const env = parseEnv(
    z.object({
        EGRESS_BROKER_PORT: z.coerce.number().int().positive().default(3004),
        EGRESS_SHARED_SECRET_FILE: z.string().min(1),
    }),
)

const app = createEgressApp({
    egressService: createEgressService(),
    now: () => new Date(),
    sharedSecret: await loadOrCreateSecret(env.EGRESS_SHARED_SECRET_FILE),
})

const server = Bun.serve({
    fetch: app.fetch,
    port: env.EGRESS_BROKER_PORT,
})

registerShutdownSignals(
    createShutdownHandler({
        steps: [{ name: 'drain-http-server', run: createServerDrain({ server, timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS }) }],
    }),
)
