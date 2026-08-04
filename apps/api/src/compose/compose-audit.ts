import { and, count, desc, eq, gte, inArray, like, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { auditLog, user } from '@containers/db-schema/schema'
import { createAuditService, type AuditServiceDb } from '../service/domain/audit/create-audit-service'

type ComposeAuditDependencies = {
    archiveRoot: string
    db: ControlDatabase
    retentionDays: number
}

export const buildAuditServiceDb = (db: ControlDatabase): AuditServiceDb => ({
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
        await db.delete(auditLog).where(inArray(auditLog.id, ids))
    },
    record: async (record) => {
        await db.insert(auditLog).values({
            actorId: record.actorId,
            authMethod: record.authMethod,
            createdAt: record.createdAt,
            detail: record.detail,
            id: record.id,
            operation: record.operation,
            requestId: record.requestId,
            result: record.result,
            sourceIp: record.sourceIp,
            targetId: record.targetId,
            targetType: record.targetType,
        })
    },
})

export const composeAudit = ({ archiveRoot, db, retentionDays }: ComposeAuditDependencies) => ({
    auditService: createAuditService({ archiveRoot, db: buildAuditServiceDb(db), now: () => new Date(), retentionDays }),
})
