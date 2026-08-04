import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { managedUserListSchema, managedUserSchema, managedUserUpdateSchema } from '@containers/contracts/user-management'
import type { ControlDatabase } from '@containers/db-schema/database'
import { invitation, apiKey as apiKeyTable, session as sessionTable, USER_ROLE, user, userRole } from '@containers/db-schema/schema'
import type { Auth } from '../../../auth/create-auth'
import { createAppError } from '../../../lib/error'

const ownerBootstrapSchema = z.object({
    email: z.email(),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
})

const invitationCreateSchema = z.object({
    email: z.email(),
    expiresInHours: z.number().int().min(1).max(168).default(24),
    role: z.enum([USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]),
})

const invitationAcceptSchema = z.object({
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
    token: z.string().min(32).max(256),
})

type AuthServiceDependencies = {
    auth: Auth
    db: ControlDatabase
    invitationBaseUrl: string
    now: () => Date
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createAuthService = ({ auth, db, invitationBaseUrl, now }: AuthServiceDependencies) => {
    let bootstrapInProgress = false
    let invitationAcceptanceInProgress = false

    const getSession = async (headers: Headers) => {
        const session = await auth.api.getSession({ headers })

        if (!session) {
            return undefined
        }

        const [roleRecord] = await db.select().from(userRole).where(eq(userRole.userId, session.user.id)).limit(1)

        if (!roleRecord || roleRecord.disabledAt) {
            return undefined
        }

        return { ...session, role: roleRecord.role }
    }

    const requireRole = async (headers: Headers, allowedRoles: string[]) => {
        const session = await getSession(headers)

        if (!session) {
            throw createAppError('AUTH_REQUIRED')
        }

        if (!allowedRoles.includes(session.role)) {
            throw createAppError('FORBIDDEN')
        }

        return session
    }

    const requireRecentRole = async (headers: Headers, allowedRoles: string[], maxAgeMs: number) => {
        const session = await requireRole(headers, allowedRoles)

        if (now().getTime() - session.session.createdAt.getTime() > maxAgeMs) {
            throw createAppError('RECENT_AUTH_REQUIRED')
        }

        return session
    }

    return {
        acceptInvitation: async (input: unknown) => {
            if (invitationAcceptanceInProgress) {
                throw createAppError('INVITATION_BUSY')
            }

            invitationAcceptanceInProgress = true

            try {
                const payload = invitationAcceptSchema.parse(input)
                const tokenHash = hashToken(payload.token)
                const [record] = await db
                    .select()
                    .from(invitation)
                    .where(
                        and(
                            eq(invitation.tokenHash, tokenHash),
                            gt(invitation.expiresAt, now()),
                            isNull(invitation.acceptedAt),
                            isNull(invitation.revokedAt),
                        ),
                    )
                    .limit(1)

                if (!record) {
                    throw createAppError('INVITATION_INVALID')
                }

                const result = await auth.api.signUpEmail({
                    body: { email: record.email, name: payload.name, password: payload.password },
                })
                const acceptedAt = now()

                await db.transaction(async (transaction) => {
                    await transaction.insert(userRole).values({
                        createdAt: acceptedAt,
                        role: record.role,
                        updatedAt: acceptedAt,
                        userId: result.user.id,
                    })
                    await transaction.update(invitation).set({ acceptedAt }).where(eq(invitation.id, record.id))
                })

                return result
            } finally {
                invitationAcceptanceInProgress = false
            }
        },
        bootstrapOwner: async (input: unknown) => {
            if (bootstrapInProgress) {
                throw createAppError('BOOTSTRAP_BUSY')
            }

            bootstrapInProgress = true

            try {
                const payload = ownerBootstrapSchema.parse(input)
                const [existing] = await db.select({ value: count() }).from(user)

                if ((existing?.value ?? 0) > 0) {
                    throw createAppError('BOOTSTRAP_COMPLETE')
                }

                const result = await auth.api.signUpEmail({ body: payload })
                const createdAt = now()

                await db.insert(userRole).values({
                    createdAt,
                    role: USER_ROLE.OWNER,
                    updatedAt: createdAt,
                    userId: result.user.id,
                })

                return result
            } finally {
                bootstrapInProgress = false
            }
        },
        createInvitation: async (headers: Headers, input: unknown) => {
            const session = await requireRecentRole(headers, [USER_ROLE.OWNER, USER_ROLE.ADMIN], 15 * 60 * 1_000)
            const payload = invitationCreateSchema.parse(input)
            const token = randomBytes(32).toString('base64url')
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + payload.expiresInHours * 60 * 60 * 1_000)

            const id = randomUUID()
            await db.insert(invitation).values({
                createdAt,
                createdBy: session.user.id,
                email: payload.email,
                expiresAt,
                id,
                role: payload.role,
                tokenHash: hashToken(token),
            })

            return {
                createdBy: session.user.id,
                email: payload.email,
                expiresAt: expiresAt.toISOString(),
                id,
                invitationUrl: `${invitationBaseUrl}/accept-invitation?token=${encodeURIComponent(token)}`,
                role: payload.role,
            }
        },
        getBootstrapStatus: async () => {
            const [existing] = await db.select({ value: count() }).from(user)
            return { required: (existing?.value ?? 0) === 0 }
        },
        getSession,
        isEmailDisabled: async (emailInput: unknown) => {
            const email = z.email().parse(emailInput)
            const [record] = await db
                .select({ disabledAt: userRole.disabledAt })
                .from(user)
                .innerJoin(userRole, eq(user.id, userRole.userId))
                .where(eq(user.email, email))
                .limit(1)
            return Boolean(record?.disabledAt)
        },
        listUsers: async (headers: Headers) => {
            await requireRole(headers, [USER_ROLE.OWNER])
            const records = await db
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
                .orderBy(asc(user.createdAt))

            return managedUserListSchema.parse(
                records.map((record) => ({
                    ...record,
                    createdAt: record.createdAt.toISOString(),
                    disabledAt: record.disabledAt?.toISOString() ?? null,
                    updatedAt: record.updatedAt.toISOString(),
                })),
            )
        },
        requireRecentRole,
        requireRole,
        updateUser: async (headers: Headers, targetUserId: string, input: unknown) => {
            const actor = await requireRecentRole(headers, [USER_ROLE.OWNER], 15 * 60 * 1_000)
            const payload = managedUserUpdateSchema.parse(input)
            const [target] = await db
                .select({
                    createdAt: user.createdAt,
                    disabledAt: userRole.disabledAt,
                    email: user.email,
                    id: user.id,
                    name: user.name,
                    role: userRole.role,
                })
                .from(user)
                .innerJoin(userRole, eq(user.id, userRole.userId))
                .where(eq(user.id, targetUserId))
                .limit(1)

            if (!target) {
                throw createAppError('USER_NOT_FOUND')
            }
            if (target.role === USER_ROLE.OWNER || target.id === actor.user.id) {
                throw createAppError('OWNER_IMMUTABLE')
            }

            const updatedAt = now()
            const disabledAt = payload.disabled === undefined ? target.disabledAt : payload.disabled ? updatedAt : null
            const role = payload.role ?? target.role
            const roleChanged = role !== target.role
            await db.transaction(async (transaction) => {
                await transaction.update(userRole).set({ disabledAt, role, updatedAt }).where(eq(userRole.userId, target.id))
                if (payload.disabled) {
                    await transaction.delete(sessionTable).where(eq(sessionTable.userId, target.id))
                }
                if (payload.disabled || roleChanged) {
                    await transaction.update(apiKeyTable).set({ revokedAt: updatedAt }).where(eq(apiKeyTable.createdBy, target.id))
                }
            })

            return managedUserSchema.parse({
                ...target,
                createdAt: target.createdAt.toISOString(),
                disabledAt: disabledAt?.toISOString() ?? null,
                role,
                updatedAt: updatedAt.toISOString(),
            })
        },
    }
}

export type AuthService = ReturnType<typeof createAuthService>
