const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const
const DRAIN_POLL_INTERVAL_MS = 200

type DrainableServer = {
    pendingRequests: number
    stop: (closeActiveConnections?: boolean) => unknown
}

/**
 * Stops accepting connections, then waits for in-flight requests up to the deadline before
 * force closing whatever remains.
 */
export const createServerDrain =
    ({ server, timeoutMs, sleep = Bun.sleep }: { server: DrainableServer; timeoutMs: number; sleep?: (ms: number) => Promise<void> }) =>
    async () => {
        server.stop(false)
        let waited = 0
        while (server.pendingRequests > 0 && waited < timeoutMs) {
            await sleep(DRAIN_POLL_INTERVAL_MS)
            waited += DRAIN_POLL_INTERVAL_MS
        }
        server.stop(true)
    }

type ShutdownStep = {
    name: string
    run: () => Promise<unknown> | unknown
}

type ShutdownLogger = (line: string) => void

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Runs the shutdown steps in order on the first termination signal, isolating each failure so a
 * broken step cannot leave the remaining ones unexecuted.
 */
export const createShutdownHandler = ({ log = console.error, steps }: { log?: ShutdownLogger; steps: ShutdownStep[] }) => {
    let shuttingDown = false

    return async () => {
        if (shuttingDown) return
        shuttingDown = true

        for (const step of steps) {
            try {
                await step.run()
            } catch (error) {
                log(
                    JSON.stringify({
                        event: 'shutdown_step_failed',
                        level: 'error',
                        message: describeError(error),
                        scope: 'egress-broker',
                        step: step.name,
                    }),
                )
            }
        }

        process.exit(0)
    }
}

export const registerShutdownSignals = (handler: () => Promise<void>) => {
    for (const signal of SHUTDOWN_SIGNALS) {
        process.on(signal, () => {
            void handler()
        })
    }
}
