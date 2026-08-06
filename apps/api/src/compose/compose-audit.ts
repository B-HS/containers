import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { auditChainAnchor, auditLog, user } from '@containers/db-schema/schema'
import { AUDIT_CHAIN_GENESIS, computeAuditEntryHash } from '@containers/config/audit-chain'
import { createAuditService, type AuditServiceDb } from '../service/domain/audit/create-audit-service'

type ComposeAuditDependencies = {
    archiveRoot: string
    db: ControlDatabase
    retentionDays: number
}

const ANCHOR_ID = 'anchor'

export const buildAuditServiceDb = (db: ControlDatabase): AuditServiceDb => ({
    countUnchained: async () => {
        const [row] = await db.select({ value: count() }).from(auditLog).where(isNull(auditLog.entryHash))
        return row?.value ?? 0
    },
    listChainAfter: async (sequence, limit) => {
        const records = await db
            .select({
                actorId: auditLog.actorId,
                authMethod: auditLog.authMethod,
                createdAt: auditLog.createdAt,
                detail: auditLog.detail,
                entryHash: auditLog.entryHash,
                id: auditLog.id,
                operation: auditLog.operation,
                previousHash: auditLog.previousHash,
                requestId: auditLog.requestId,
                result: auditLog.result,
                sequence: auditLog.sequence,
                sourceIp: auditLog.sourceIp,
                targetId: auditLog.targetId,
                targetType: auditLog.targetType,
            })
            .from(auditLog)
            .where(gt(auditLog.sequence, sequence))
            .orderBy(asc(auditLog.sequence))
            .limit(limit)
        return records.flatMap((record) =>
            record.entryHash === null || record.previousHash === null || record.sequence === null
                ? []
                : [{ ...record, entryHash: record.entryHash, previousHash: record.previousHash, sequence: record.sequence }],
        )
    },
    readAnchor: async () => {
        const [record] = await db
            .select({ hash: auditChainAnchor.hash, sequence: auditChainAnchor.sequence })
            .from(auditChainAnchor)
            .where(eq(auditChainAnchor.id, ANCHOR_ID))
            .limit(1)
        return record
    },
    list: async (query) => {
        const conditions: SQL[] = []
        if (query.actorEmail) {
            conditions.push(like(user.email, `%${query.actorEmail}%`))
        }
        if (query.from) {
            conditions.push(gte(auditLog.createdAt, query.from))
        }
        if (query.operation) {
            conditions.push(eq(auditLog.operation, query.operation))
        }
        if (query.result) {
            conditions.push(eq(auditLog.result, query.result))
        }
        if (query.targetId) {
            conditions.push(eq(auditLog.targetId, query.targetId))
        }
        if (query.targetType) {
            conditions.push(eq(auditLog.targetType, query.targetType))
        }
        if (query.to) {
            conditions.push(lte(auditLog.createdAt, query.to))
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined
        const [totals, records] = await Promise.all([
            db.select({ value: count() }).from(auditLog).leftJoin(user, eq(auditLog.actorId, user.id)).where(where),
            db
                .select({
                    actorEmail: user.email,
                    actorId: auditLog.actorId,
                    authMethod: auditLog.authMethod,
                    createdAt: auditLog.createdAt,
                    detail: auditLog.detail,
                    id: auditLog.id,
                    operation: auditLog.operation,
                    requestId: auditLog.requestId,
                    result: auditLog.result,
                    sourceIp: auditLog.sourceIp,
                    targetId: auditLog.targetId,
                    targetType: auditLog.targetType,
                })
                .from(auditLog)
                .leftJoin(user, eq(auditLog.actorId, user.id))
                .where(where)
                .orderBy(desc(auditLog.createdAt), desc(sql`${auditLog}.rowid`))
                .limit(query.limit)
                .offset(query.offset),
        ])

        return { records, total: totals[0]?.value ?? 0 }
    },
    listBefore: async (threshold, limit) =>
        db
            .select({
                actorId: auditLog.actorId,
                authMethod: auditLog.authMethod,
                createdAt: auditLog.createdAt,
                detail: auditLog.detail,
                id: auditLog.id,
                operation: auditLog.operation,
                requestId: auditLog.requestId,
                result: auditLog.result,
                sourceIp: auditLog.sourceIp,
                targetId: auditLog.targetId,
                targetType: auditLog.targetType,
            })
            .from(auditLog)
            .where(lt(auditLog.createdAt, threshold))
            .orderBy(auditLog.createdAt, sql`${auditLog}.rowid`)
            .limit(limit),
    deleteByIds: async (ids) => {
        await db.transaction(async (transaction) => {
            const archived = await transaction
                .select({ entryHash: auditLog.entryHash, sequence: auditLog.sequence })
                .from(auditLog)
                .where(inArray(auditLog.id, ids))
                .orderBy(desc(auditLog.sequence))
                .limit(1)
            await transaction.delete(auditLog).where(inArray(auditLog.id, ids))
            const head = archived[0]
            if (head?.entryHash === undefined || head.entryHash === null || head.sequence === null) return
            const anchor = { hash: head.entryHash, id: ANCHOR_ID, sequence: head.sequence, updatedAt: new Date() }
            await transaction
                .insert(auditChainAnchor)
                .values(anchor)
                .onConflictDoUpdate({
                    set: { hash: anchor.hash, sequence: anchor.sequence, updatedAt: anchor.updatedAt },
                    target: auditChainAnchor.id,
                })
        })
    },
    record: async (record) => {
        await db.transaction(async (transaction) => {
            const [head] = await transaction
                .select({ entryHash: auditLog.entryHash, sequence: auditLog.sequence })
                .from(auditLog)
                .where(isNotNull(auditLog.sequence))
                .orderBy(desc(auditLog.sequence))
                .limit(1)
            const [anchor] = await transaction
                .select({ hash: auditChainAnchor.hash, sequence: auditChainAnchor.sequence })
                .from(auditChainAnchor)
                .where(eq(auditChainAnchor.id, ANCHOR_ID))
                .limit(1)
            const previousHash = head?.entryHash ?? anchor?.hash ?? AUDIT_CHAIN_GENESIS
            const entry = {
                actorId: record.actorId,
                authMethod: record.authMethod,
                createdAt: record.createdAt,
                detail: record.detail ?? null,
                id: record.id,
                operation: record.operation,
                requestId: record.requestId,
                result: record.result,
                sequence: (head?.sequence ?? anchor?.sequence ?? 0) + 1,
                sourceIp: record.sourceIp ?? null,
                targetId: record.targetId,
                targetType: record.targetType,
            }
            await transaction.insert(auditLog).values({ ...entry, entryHash: computeAuditEntryHash(entry, previousHash), previousHash })
        })
    },
})

export const composeAudit = ({ archiveRoot, db, retentionDays }: ComposeAuditDependencies) => ({
    auditService: createAuditService({ archiveRoot, db: buildAuditServiceDb(db), now: () => new Date(), retentionDays }),
})
