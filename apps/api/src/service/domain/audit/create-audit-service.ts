import { randomUUID } from 'node:crypto'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { auditEventListSchema, auditQuerySchema } from '@containers/contracts/audit'
import type { ControlDatabase } from '@containers/db-schema/database'
import { auditLog, user } from '@containers/db-schema/schema'

type AuditRecord = {
    actorId: string
    authMethod?: 'api-key' | 'invitation' | 'session'
    detail?: Record<string, unknown>
    operation: string
    requestId: string
    result: 'attempt' | 'failure' | 'success'
    sourceIp: string | undefined
    targetId: string
    targetType:
        | 'artifact'
        | 'backup'
        | 'container'
        | 'deployment-manifest'
        | 'deployment-release'
        | 'deployment-secret'
        | 'image'
        | 'invitation'
        | 'job'
        | 'maintenance'
        | 'network'
        | 'nginx-config'
        | 'nginx-route'
        | 'notification-destination'
        | 'registry-credential'
        | 'system'
        | 'user'
        | 'volume'
}

type AuditServiceDependencies = {
    db: ControlDatabase
    now: () => Date
}

const maskIp = (sourceIp: string | null) => {
    if (!sourceIp) {
        return null
    }

    if (sourceIp.includes('.')) {
        const parts = sourceIp.split('.')
        return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : 'masked'
    }

    return sourceIp.includes(':')
        ? `${sourceIp
              .split(':')
              .filter((part) => part.length > 0)
              .slice(0, 4)
              .join(':')}::`
        : 'masked'
}

const parseDetail = (detail: string | null) => {
    if (!detail) {
        return null
    }

    try {
        const value: unknown = JSON.parse(detail)
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null
    } catch {
        return null
    }
}

export const createAuditService = ({ db, now }: AuditServiceDependencies) => ({
    list: async (input: unknown) => {
        const query = auditQuerySchema.parse(input)
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

        const records = await db
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

        return auditEventListSchema.parse(
            records.map((record) => ({
                ...record,
                createdAt: record.createdAt.toISOString(),
                detail: parseDetail(record.detail),
                sourceIpMasked: maskIp(record.sourceIp),
            })),
        )
    },
    record: async (record: AuditRecord) =>
        db.insert(auditLog).values({
            actorId: record.actorId,
            authMethod: record.authMethod ?? 'session',
            createdAt: now(),
            detail: record.detail ? JSON.stringify(record.detail) : undefined,
            id: randomUUID(),
            operation: record.operation,
            requestId: record.requestId,
            result: record.result,
            sourceIp: record.sourceIp,
            targetId: record.targetId,
            targetType: record.targetType,
        }),
})

export type AuditService = ReturnType<typeof createAuditService>
