import { isWithinFailureWindow, lockDurationMs, toLoginLockoutKey } from '@containers/config/login-lockout'
import { createAppError } from '../../../lib/error'

type LockoutRow = {
    emailKey: string
    failedCount: number
    firstFailedAt: Date
    lockedUntil: Date | null
    updatedAt: Date
}

type LoginLockoutServiceDb = {
    clear: (emailKey: string) => Promise<void>
    findByEmailKey: (emailKey: string) => Promise<LockoutRow | undefined>
    upsert: (row: LockoutRow) => Promise<void>
}

type LoginLockoutServiceDependencies = {
    db: LoginLockoutServiceDb
    now: () => Date
}

export type { LockoutRow, LoginLockoutServiceDb }

const SECOND_MS = 1_000

export const createLoginLockoutService = ({ db, now }: LoginLockoutServiceDependencies) => ({
    assertNotLocked: async (email: unknown) => {
        const emailKey = toLoginLockoutKey(email)
        if (emailKey === null) return
        const record = await db.findByEmailKey(emailKey)
        if (!record?.lockedUntil) return
        const timestamp = now()
        if (record.lockedUntil.getTime() <= timestamp.getTime()) return
        throw createAppError('AUTH_LOCKED', undefined, {
            retryAfterSeconds: Math.ceil((record.lockedUntil.getTime() - timestamp.getTime()) / SECOND_MS),
        })
    },
    clear: async (email: unknown) => {
        const emailKey = toLoginLockoutKey(email)
        if (emailKey === null) return
        await db.clear(emailKey)
    },
    recordFailure: async (email: unknown) => {
        const emailKey = toLoginLockoutKey(email)
        if (emailKey === null) return { failedCount: 0, lockedUntil: null }
        const timestamp = now()
        const record = await db.findByEmailKey(emailKey)
        const continues = record !== undefined && isWithinFailureWindow(record.firstFailedAt, timestamp)
        const failedCount = continues ? record.failedCount + 1 : 1
        const duration = lockDurationMs(failedCount)
        const lockedUntil = duration === 0 ? null : new Date(timestamp.getTime() + duration)
        await db.upsert({
            emailKey,
            failedCount,
            firstFailedAt: continues ? record.firstFailedAt : timestamp,
            lockedUntil,
            updatedAt: timestamp,
        })
        return { failedCount, lockedUntil }
    },
})

export type LoginLockoutService = ReturnType<typeof createLoginLockoutService>
