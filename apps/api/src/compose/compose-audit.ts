import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { auditLog, user } from '@containers/db-schema/schema'
import { createAuditService, type AuditServiceDb } from '../service/domain/audit/create-audit-service'

type ComposeAuditDependencies = {
    db: ControlDatabase
}

export const buildAuditServiceDb = (db: ControlDatabase): AuditServiceDb => ({
    list: async (query) => {
        const conditions: SQL[] = []
        if (query.operation) {
            conditions.push(eq(auditLog.operation, query.operation))
        }
        if (query.result) {
            conditions.push(eq(auditLog.result, query.result))
        }
        if (query.targetType) {
            conditions.push(eq(auditLog.targetType, query.targetType))
        }
        return db
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
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(auditLog.createdAt))
            .limit(query.limit)
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

export const composeAudit = ({ db }: ComposeAuditDependencies) => ({
    auditService: createAuditService({ db: buildAuditServiceDb(db), now: () => new Date() }),
})
