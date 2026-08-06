import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { API_KEY_SCOPE, apiKeyCreateResultSchema, apiKeyCreateSchema, apiKeyListSchema, type ApiKeyScope } from '@containers/contracts/api-key'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/error'

const OWNER_ONLY_API_KEY_SCOPES: readonly ApiKeyScope[] = [API_KEY_SCOPE.BACKUP_WRITE, API_KEY_SCOPE.SECRET_WRITE]

export const requiresOwnerApiKeyScope = (scopes: readonly ApiKeyScope[]) => scopes.some((scope) => OWNER_ONLY_API_KEY_SCOPES.includes(scope))

type ApiKeyRow = {
    createdAt: Date
    createdBy: string
    expiresAt: Date | null
    id: string
    lastUsedAt: Date | null
    name: string
    prefix: string
    revokedAt: Date | null
    scopes: string
    tokenHash: string
}

type ApiKeyAuthRecord = {
    api_key: ApiKeyRow
    user_role: { role: string }
}

type ApiKeyServiceDb = {
    findByTokenHash: (tokenHash: string, now: Date) => Promise<ApiKeyAuthRecord | undefined>
    insert: (record: {
        createdAt: Date
        createdBy: string
        expiresAt: Date | null
        id: string
        name: string
        prefix: string
        scopes: string
        tokenHash: string
    }) => Promise<void>
    list: () => Promise<ApiKeyRow[]>
    touchLastUsed: (id: string, lastUsedAt: Date) => Promise<void>
    revoke: (id: string, revokedAt: Date) => Promise<{ id: string } | undefined>
}

type ApiKeyServiceDependencies = {
    db: ApiKeyServiceDb
    now: () => Date
    rateLimitPerMinute?: number
}

export type { ApiKeyServiceDb }

const DAY_MS = 24 * 60 * 60 * 1_000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const parseScopes = (value: string) => JSON.parse(value) as unknown

const toApiKey = (record: ApiKeyRow) => ({
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    id: record.id,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    name: record.name,
    prefix: record.prefix,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    scopes: parseScopes(record.scopes),
})

export const createApiKeyService = ({ db, now, rateLimitPerMinute = 120 }: ApiKeyServiceDependencies) => {
    const rateWindows = new Map<string, { count: number; startedAt: number }>()

    return {
        authenticate: async (headers: Headers, requiredScope: ApiKeyScope) => {
            const authorization = headers.get('authorization')
            const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined
            if (!token?.startsWith('ctk_')) {
                throw createAppError('AUTH_REQUIRED')
            }

            const currentTime = now()
            const joined = await db.findByTokenHash(hashToken(token), currentTime)
            const record = joined?.api_key
            if (!record) {
                throw createAppError('AUTH_REQUIRED')
            }

            const scopes = apiKeyListSchema.element.shape.scopes.parse(parseScopes(record.scopes))
            if (!scopes.includes(requiredScope)) {
                throw createAppError('FORBIDDEN')
            }
            if (requiresOwnerApiKeyScope([requiredScope]) && joined.user_role.role !== USER_ROLE.OWNER) {
                throw createAppError('FORBIDDEN')
            }

            const nowMilliseconds = currentTime.getTime()
            const rateWindow = rateWindows.get(record.id)
            if (rateWindow && nowMilliseconds - rateWindow.startedAt < 60_000) {
                if (rateWindow.count >= rateLimitPerMinute) {
                    throw createAppError('API_KEY_RATE_LIMITED')
                }
                rateWindow.count += 1
            } else {
                rateWindows.set(record.id, { count: 1, startedAt: nowMilliseconds })
            }
            if (rateWindows.size > 10_000) {
                for (const [id, window] of rateWindows) {
                    if (nowMilliseconds - window.startedAt >= 60_000) {
                        rateWindows.delete(id)
                    }
                }
            }

            await db.touchLastUsed(record.id, currentTime)
            return { actorId: record.createdBy, apiKeyId: record.id, authMethod: 'api-key' as const }
        },
        create: async (actor: { id: string; role: string }, input: unknown) => {
            const payload = apiKeyCreateSchema.parse(input)
            if (requiresOwnerApiKeyScope(payload.scopes) && actor.role !== USER_ROLE.OWNER) {
                throw createAppError('FORBIDDEN')
            }
            const token = `ctk_${randomBytes(32).toString('base64url')}`
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + payload.expiresInDays * DAY_MS)
            const record = {
                createdAt,
                createdBy: actor.id,
                expiresAt,
                id: randomUUID(),
                name: payload.name,
                prefix: token.slice(0, 12),
                scopes: JSON.stringify(payload.scopes),
                tokenHash: hashToken(token),
            }
            await db.insert(record)

            return apiKeyCreateResultSchema.parse({ ...toApiKey({ ...record, lastUsedAt: null, revokedAt: null }), token })
        },
        list: async () => apiKeyListSchema.parse((await db.list()).map(toApiKey)),
        revoke: async (id: string) => {
            const result = await db.revoke(id, now())
            if (result === undefined) {
                throw createAppError('API_KEY_NOT_FOUND')
            }
            rateWindows.delete(id)
            return { id, revoked: true as const }
        },
    }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
