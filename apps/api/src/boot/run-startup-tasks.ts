type StartupTask = {
    name: string
    run: () => Promise<unknown>
}

type StartupTaskFailure = {
    message: string
    name: string
}

type StartupLogger = (line: string) => void

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

const formatEvent = (event: string, failure: StartupTaskFailure) =>
    JSON.stringify({ event, level: 'error', message: failure.message, scope: 'api', task: failure.name })

/**
 * Runs optional boot-time recovery tasks in order, isolating each failure so that a
 * single broken step cannot prevent the HTTP server from starting.
 */
export const runStartupTasks = async ({ log = console.error, tasks }: { log?: StartupLogger; tasks: StartupTask[] }) => {
    const failures: StartupTaskFailure[] = []
    for (const task of tasks) {
        try {
            await task.run()
        } catch (error) {
            const failure = { message: describeError(error), name: task.name }
            failures.push(failure)
            log(formatEvent('startup_task_failed', failure))
        }
    }
    return failures
}

/**
 * Schedules a recurring background task whose failures are logged instead of surfacing
 * as unhandled rejections.
 */
export const startRecurringTask = ({
    intervalMs,
    log = console.error,
    name,
    run,
}: {
    intervalMs: number
    log?: StartupLogger
    name: string
    run: () => Promise<unknown>
}) =>
    setInterval(() => {
        void run().catch((error: unknown) => log(formatEvent('recurring_task_failed', { message: describeError(error), name })))
    }, intervalMs)

export type { StartupTask, StartupTaskFailure }
