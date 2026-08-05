import { USER_ROLE } from '@containers/contracts/user-management'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { managedUserListSchema, managedUserSchema, managedUserUpdateSchema } from '@containers/contracts/user-management'
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

type RoleRecord = {
    disabledAt: Date | null
    role: string
    updatedAt: Date
    userId: string
}

type InvitationRecord = {
    createdAt: Date
    createdBy: string
    email: string
    expiresAt: Date
    id: string
    role: string
    tokenHash: string
}

type UserRow = {
    createdAt: Date
    email: string
    id: string
    name: string
}

type UserWithRole = UserRow & { disabledAt: Date | null; role: string; updatedAt: Date }

type AuthServiceDb = {
    countUsers: () => Promise<number>
    findRoleByUser: (userId: string) => Promise<RoleRecord | undefined>
    findInvitationByTokenHash: (tokenHash: string, now: Date) => Promise<InvitationRecord | undefined>
    findUserByEmail: (email: string) => Promise<{ disabledAt: Date | null } | undefined>
    findUserWithRole: (userId: string) => Promise<UserWithRole | undefined>
    listUsersWithRole: () => Promise<UserWithRole[]>
    insertInvitation: (record: {
        createdAt: Date
        createdBy: string
        email: string
        expiresAt: Date
        id: string
        role: string
        tokenHash: string
    }) => Promise<void>
    insertRole: (record: { createdAt: Date; role: string; updatedAt: Date; userId: string }) => Promise<void>
    acceptInvitation: (record: { acceptedAt: Date; role: string; userId: string }, invitationId: string) => Promise<void>
    updateUser: (
        values: { disabledAt: Date | null; role: string; updatedAt: Date; userId: string },
        deletedSessionUserId: string | null,
        revokedApiKeyOwnerId: string | null,
    ) => Promise<void>
}

type AuthServiceDependencies = {
    auth: Auth
    db: AuthServiceDb
    invitationBaseUrl: string
    now: () => Date
}

export type { AuthServiceDb }

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createAuthService = ({ auth, db, invitationBaseUrl, now }: AuthServiceDependencies) => {
    let bootstrapInProgress = false
    let invitationAcceptanceInProgress = false

    const getSession = async (headers: Headers) => {
        const session = await auth.api.getSession({ headers })

        if (!session) {
            return undefined
        }

        const roleRecord = await db.findRoleByUser(session.user.id)

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
                const record = await db.findInvitationByTokenHash(tokenHash, now())

                if (!record) {
                    throw createAppError('INVITATION_INVALID')
                }

                const result = await auth.api.signUpEmail({
                    body: { email: record.email, name: payload.name, password: payload.password },
                })
                const acceptedAt = now()

                await db.acceptInvitation({ acceptedAt, role: record.role, userId: result.user.id }, record.id)

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
                const userCount = await db.countUsers()

                if (userCount > 0) {
                    throw createAppError('BOOTSTRAP_COMPLETE')
                }

                const result = await auth.api.signUpEmail({ body: payload })
                const createdAt = now()

                await db.insertRole({
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
            await db.insertInvitation({
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
            const userCount = await db.countUsers()
            return { required: userCount === 0 }
        },
        getSession,
        isEmailDisabled: async (emailInput: unknown) => {
            const email = z.email().parse(emailInput)
            const record = await db.findUserByEmail(email)
            return Boolean(record?.disabledAt)
        },
        listUsers: async (headers: Headers) => {
            await requireRole(headers, [USER_ROLE.OWNER])
            const records = await db.listUsersWithRole()

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
            const target = await db.findUserWithRole(targetUserId)

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
            await db.updateUser(
                { disabledAt, role, updatedAt, userId: target.id },
                payload.disabled ? target.id : null,
                payload.disabled || roleChanged ? target.id : null,
            )

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
