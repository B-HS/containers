import { randomUUID } from 'node:crypto'
import { auditEventListSchema, auditQuerySchema } from '@containers/contracts/audit'

type AuditListQuery = {
    limit: number
    operation?: string
    result?: string
    targetType?: string
}

type AuditListRecord = {
    actorEmail: string | null
    actorId: string | null
    authMethod: string
    createdAt: Date
    detail: string | null
    id: string
    operation: string
    requestId: string
    result: string
    sourceIp: string | null
    targetId: string | null
    targetType: string
}

type AuditInsertRecord = {
    actorId: string
    authMethod: string
    createdAt: Date
    detail?: string
    id: string
    operation: string
    requestId: string
    result: string
    sourceIp?: string
    targetId: string
    targetType: string
}

type AuditServiceDb = {
    list: (query: AuditListQuery) => Promise<AuditListRecord[]>
    record: (record: AuditInsertRecord) => Promise<void>
}

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
    db: AuditServiceDb
    now: () => Date
}

export type { AuditServiceDb }

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
        const conditions: { operation?: string; result?: string; targetType?: string } = {}
        if (query.operation) {
            conditions.operation = query.operation
        }
        if (query.result) {
            conditions.result = query.result
        }
        if (query.targetType) {
            conditions.targetType = query.targetType
        }

        const records = await db.list({ ...conditions, limit: query.limit })

        return auditEventListSchema.parse(
            records.map((record) => ({
                ...record,
                createdAt: record.createdAt.toISOString(),
                detail: parseDetail(record.detail),
                sourceIpMasked: maskIp(record.sourceIp),
            })),
        )
    },
    record: async (record: AuditRecord) => {
        const detail = record.detail ? JSON.stringify(record.detail) : undefined
        const sourceIp = record.sourceIp
        return db.record({
            actorId: record.actorId,
            authMethod: record.authMethod ?? 'session',
            createdAt: now(),
            id: randomUUID(),
            operation: record.operation,
            requestId: record.requestId,
            result: record.result,
            targetId: record.targetId,
            targetType: record.targetType,
            ...(detail === undefined ? {} : { detail }),
            ...(sourceIp === undefined ? {} : { sourceIp }),
        })
    },
})

export type AuditService = ReturnType<typeof createAuditService>
