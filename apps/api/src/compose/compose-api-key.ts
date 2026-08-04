import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { apiKey, userRole } from '@containers/db-schema/schema'
import { createApiKeyService, type ApiKeyServiceDb } from '../service/domain/api-key/create-api-key-service'

type ComposeApiKeyDependencies = {
    db: ControlDatabase
    rateLimitPerMinute?: number
}

export const buildApiKeyServiceDb = (db: ControlDatabase): ApiKeyServiceDb => ({
    findByTokenHash: async (tokenHash, now) => {
        const [joined] = await db
            .select()
            .from(apiKey)
            .innerJoin(userRole, eq(userRole.userId, apiKey.createdBy))
            .where(
                and(
                    eq(apiKey.tokenHash, tokenHash),
                    isNull(apiKey.revokedAt),
                    or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, now)),
                    isNull(userRole.disabledAt),
                ),
            )
            .limit(1)
        return joined
    },
    insert: async (record) => {
        await db.insert(apiKey).values(record)
    },
    list: async () => db.select().from(apiKey).orderBy(desc(apiKey.createdAt)),
    touchLastUsed: async (id, lastUsedAt) => {
        await db.update(apiKey).set({ lastUsedAt }).where(eq(apiKey.id, id))
    },
    revoke: async (id, revokedAt) => {
        const result = await db
            .update(apiKey)
            .set({ revokedAt })
            .where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
            .returning({ id: apiKey.id })
        return result[0]
    },
})

export const composeApiKey = ({ db, rateLimitPerMinute }: ComposeApiKeyDependencies) => ({
    apiKeyService: createApiKeyService({
        db: buildApiKeyServiceDb(db),
        now: () => new Date(),
        ...(rateLimitPerMinute === undefined ? {} : { rateLimitPerMinute }),
    }),
})
