import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { apiKeyCreateResultSchema, apiKeyCreateSchema, apiKeyListSchema, type ApiKeyScope } from '@containers/contracts/api-key'
import type { ControlDatabase } from '@containers/db-schema/database'
import { apiKey } from '@containers/db-schema/schema'

type ApiKeyServiceDependencies = {
    db: ControlDatabase
    now: () => Date
    rateLimitPerMinute?: number
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const parseScopes = (value: string) => JSON.parse(value) as unknown

const toApiKey = (record: typeof apiKey.$inferSelect) => ({
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
                throw new Error('AUTH_REQUIRED')
            }

            const currentTime = now()
            const [record] = await db
                .select()
                .from(apiKey)
                .where(
                    and(
                        eq(apiKey.tokenHash, hashToken(token)),
                        isNull(apiKey.revokedAt),
                        or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, currentTime)),
                    ),
                )
                .limit(1)
            if (!record) {
                throw new Error('AUTH_REQUIRED')
            }

            const scopes = apiKeyListSchema.element.shape.scopes.parse(parseScopes(record.scopes))
            if (!scopes.includes(requiredScope)) {
                throw new Error('FORBIDDEN')
            }

            const nowMilliseconds = currentTime.getTime()
            const rateWindow = rateWindows.get(record.id)
            if (rateWindow && nowMilliseconds - rateWindow.startedAt < 60_000) {
                if (rateWindow.count >= rateLimitPerMinute) {
                    throw new Error('API_KEY_RATE_LIMITED')
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

            await db.update(apiKey).set({ lastUsedAt: currentTime }).where(eq(apiKey.id, record.id))
            return { actorId: record.createdBy, apiKeyId: record.id, authMethod: 'api-key' as const }
        },
        create: async (actorId: string, input: unknown) => {
            const payload = apiKeyCreateSchema.parse(input)
            const token = `ctk_${randomBytes(32).toString('base64url')}`
            const createdAt = now()
            const expiresAt = payload.expiresInDays === null ? null : new Date(createdAt.getTime() + payload.expiresInDays * 24 * 60 * 60 * 1_000)
            const record = {
                createdAt,
                createdBy: actorId,
                expiresAt,
                id: randomUUID(),
                name: payload.name,
                prefix: token.slice(0, 12),
                scopes: JSON.stringify(payload.scopes),
                tokenHash: hashToken(token),
            }
            await db.insert(apiKey).values(record)

            return apiKeyCreateResultSchema.parse({ ...toApiKey({ ...record, lastUsedAt: null, revokedAt: null }), token })
        },
        list: async () => apiKeyListSchema.parse((await db.select().from(apiKey).orderBy(desc(apiKey.createdAt))).map(toApiKey)),
        revoke: async (id: string) => {
            const result = await db
                .update(apiKey)
                .set({ revokedAt: now() })
                .where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
                .returning({ id: apiKey.id })
            if (result.length === 0) {
                throw new Error('API_KEY_NOT_FOUND')
            }
            rateWindows.delete(id)
            return { id, revoked: true as const }
        },
    }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
