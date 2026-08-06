import { and, asc, count, eq, gt, isNull } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { account, invitation, apiKey as apiKeyTable, loginLockout, session as sessionTable, user, userRole } from '@containers/db-schema/schema'
import type { Auth } from '../auth/create-auth'
import { createAuthService, type AuthServiceDb } from '../service/domain/auth/create-auth-service'
import { createLoginLockoutService, type LoginLockoutServiceDb } from '../service/domain/auth/create-login-lockout-service'

type ComposeAuthDependencies = {
    auth: Auth
    db: ControlDatabase
    invitationBaseUrl: () => string
}

type AuthRole = 'admin' | 'auditor' | 'operator' | 'owner' | 'viewer'

export const buildAuthServiceDb = (db: ControlDatabase): AuthServiceDb => ({
    countUsers: async () => {
        const [existing] = await db.select({ value: count() }).from(user)
        return existing?.value ?? 0
    },
    deleteUser: async (userId) => {
        await db.transaction(async (transaction) => {
            await transaction.update(apiKeyTable).set({ revokedAt: new Date() }).where(eq(apiKeyTable.createdBy, userId))
            await transaction.delete(sessionTable).where(eq(sessionTable.userId, userId))
            await transaction.delete(account).where(eq(account.userId, userId))
            await transaction.delete(userRole).where(eq(userRole.userId, userId))
            await transaction.delete(user).where(eq(user.id, userId))
        })
    },
    findRoleByUser: async (userId) => {
        const [roleRecord] = await db.select().from(userRole).where(eq(userRole.userId, userId)).limit(1)
        return roleRecord
    },
    findInvitationByTokenHash: async (tokenHash, now) => {
        const [record] = await db
            .select()
            .from(invitation)
            .where(
                and(eq(invitation.tokenHash, tokenHash), gt(invitation.expiresAt, now), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)),
            )
            .limit(1)
        return record
    },
    findUserByEmail: async (email) => {
        const [record] = await db
            .select({ disabledAt: userRole.disabledAt })
            .from(user)
            .innerJoin(userRole, eq(user.id, userRole.userId))
            .where(eq(user.email, email))
            .limit(1)
        return record
    },
    findUserWithRole: async (userId) => {
        const [record] = await db
            .select({
                createdAt: user.createdAt,
                disabledAt: userRole.disabledAt,
                email: user.email,
                id: user.id,
                name: user.name,
                role: userRole.role,
                updatedAt: userRole.updatedAt,
            })
            .from(user)
            .innerJoin(userRole, eq(user.id, userRole.userId))
            .where(eq(user.id, userId))
            .limit(1)
        return record
    },
    insertInvitation: async (record) => {
        await db.insert(invitation).values({ ...record, role: record.role as 'admin' | 'auditor' | 'operator' | 'viewer' })
    },
    insertRole: async (record) => {
        await db.insert(userRole).values({ ...record, role: record.role as AuthRole })
    },
    acceptInvitation: async (record, invitationId) => {
        await db.transaction(async (transaction) => {
            await transaction.insert(userRole).values({
                createdAt: record.acceptedAt,
                role: record.role as AuthRole,
                updatedAt: record.acceptedAt,
                userId: record.userId,
            })
            await transaction.update(invitation).set({ acceptedAt: record.acceptedAt }).where(eq(invitation.id, invitationId))
        })
    },
    listUsersWithRole: async () =>
        db
            .select({
                createdAt: user.createdAt,
                disabledAt: userRole.disabledAt,
                email: user.email,
                id: user.id,
                name: user.name,
                role: userRole.role,
                updatedAt: userRole.updatedAt,
            })
            .from(user)
            .innerJoin(userRole, eq(user.id, userRole.userId))
            .orderBy(asc(user.createdAt)),
    updateUser: async (values, deletedSessionUserId, revokedApiKeyOwnerId) => {
        await db.transaction(async (transaction) => {
            await transaction
                .update(userRole)
                .set({ disabledAt: values.disabledAt, role: values.role as AuthRole, updatedAt: values.updatedAt })
                .where(eq(userRole.userId, values.userId))
            if (deletedSessionUserId !== null) {
                await transaction.delete(sessionTable).where(eq(sessionTable.userId, deletedSessionUserId))
            }
            if (revokedApiKeyOwnerId !== null) {
                await transaction.update(apiKeyTable).set({ revokedAt: values.updatedAt }).where(eq(apiKeyTable.createdBy, revokedApiKeyOwnerId))
            }
        })
    },
})

export const buildLoginLockoutServiceDb = (db: ControlDatabase): LoginLockoutServiceDb => ({
    clear: async (emailKey) => {
        await db.delete(loginLockout).where(eq(loginLockout.emailKey, emailKey))
    },
    findByEmailKey: async (emailKey) => {
        const [record] = await db.select().from(loginLockout).where(eq(loginLockout.emailKey, emailKey)).limit(1)
        return record
    },
    upsert: async (row) => {
        await db
            .insert(loginLockout)
            .values(row)
            .onConflictDoUpdate({
                set: { failedCount: row.failedCount, firstFailedAt: row.firstFailedAt, lockedUntil: row.lockedUntil, updatedAt: row.updatedAt },
                target: loginLockout.emailKey,
            })
    },
})

export const composeAuth = ({ auth, db, invitationBaseUrl }: ComposeAuthDependencies) => ({
    auth,
    authService: createAuthService({ auth, db: buildAuthServiceDb(db), invitationBaseUrl, now: () => new Date() }),
    loginLockoutService: createLoginLockoutService({ db: buildLoginLockoutServiceDb(db), now: () => new Date() }),
})
