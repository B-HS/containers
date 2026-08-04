type InteractiveExecSessionGuardDependencies = {
    idleTimeoutMs: number
    maxDurationMs: number
    onIdleTimeout: () => void
    onMaxDuration: () => void
}

export const createInteractiveExecSessionGuard = ({
    idleTimeoutMs,
    maxDurationMs,
    onIdleTimeout,
    onMaxDuration,
}: InteractiveExecSessionGuardDependencies) => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let maxDurationTimer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const stop = () => {
        stopped = true
        if (idleTimer) {
            clearTimeout(idleTimer)
        }
        if (maxDurationTimer) {
            clearTimeout(maxDurationTimer)
        }
    }
    const touch = () => {
        if (stopped) {
            return
        }
        if (idleTimer) {
            clearTimeout(idleTimer)
        }
        idleTimer = setTimeout(() => {
            stop()
            onIdleTimeout()
        }, idleTimeoutMs)
    }
    const start = () => {
        touch()
        maxDurationTimer = setTimeout(() => {
            stop()
            onMaxDuration()
        }, maxDurationMs)
    }

    return { start, stop, touch }
}
