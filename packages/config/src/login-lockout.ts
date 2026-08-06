const FAILURE_WINDOW_MS = 15 * 60 * 1_000
const FREE_ATTEMPTS = 5
const FIRST_LOCK_MS = 60 * 1_000
const MAX_LOCK_MS = 15 * 60 * 1_000

export const LOGIN_LOCKOUT_POLICY = {
    failureWindowMs: FAILURE_WINDOW_MS,
    freeAttempts: FREE_ATTEMPTS,
    firstLockMs: FIRST_LOCK_MS,
    maxLockMs: MAX_LOCK_MS,
} as const

/**
 * Normalizes the address a sign-in attempt was made for so counters cannot be split by casing or
 * padding. Returns null when the value is not a usable address, which the caller treats as no key.
 */
export const toLoginLockoutKey = (email: unknown) => {
    if (typeof email !== 'string') return null
    const trimmed = email.trim().toLowerCase()
    return trimmed.length === 0 ? null : trimmed
}

/**
 * Returns how long the next attempt must wait after a given number of consecutive failures.
 * The delay doubles per failure past the free allowance and is capped, so a brute force attempt
 * slows to a trickle while a locked-out operator always regains access within the cap.
 */
export const lockDurationMs = (failedCount: number) => {
    if (failedCount <= FREE_ATTEMPTS) return 0
    const doublings = failedCount - FREE_ATTEMPTS - 1
    return Math.min(FIRST_LOCK_MS * 2 ** doublings, MAX_LOCK_MS)
}

/**
 * Reports whether consecutive failures recorded at the given time still belong to the same window.
 * Failures older than the window start a fresh count so an occasional typo never accumulates.
 */
export const isWithinFailureWindow = (firstFailedAt: Date, now: Date) => now.getTime() - firstFailedAt.getTime() < FAILURE_WINDOW_MS
