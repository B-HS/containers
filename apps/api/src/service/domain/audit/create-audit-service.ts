import { randomUUID } from 'node:crypto'
import { auditEventListSchema, auditQuerySchema, type AuditResult, type AuditTargetType } from '@containers/contracts/audit'

type AuditListQuery = {
    actorEmail?: string
    from?: Date
    limit: number
    offset: number
    operation?: string
    result?: string
    targetId?: string
    targetType?: string
    to?: Date
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

type AuditListPage = {
    records: AuditListRecord[]
    total: number
}

type AuditServiceDb = {
    list: (query: AuditListQuery) => Promise<AuditListPage>
    record: (record: AuditInsertRecord) => Promise<void>
}

type AuditRecord = {
    actorId: string
    authMethod?: 'api-key' | 'invitation' | 'session'
    detail?: Record<string, unknown>
    operation: string
    requestId: string
    result: AuditResult
    sourceIp: string | undefined
    targetId: string
    targetType: AuditTargetType
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
        const conditions: Omit<AuditListQuery, 'limit' | 'offset'> = {}
        if (query.actorEmail) {
            conditions.actorEmail = query.actorEmail
        }
        if (query.from) {
            conditions.from = new Date(query.from)
        }
        if (query.operation) {
            conditions.operation = query.operation
        }
        if (query.result) {
            conditions.result = query.result
        }
        if (query.targetId) {
            conditions.targetId = query.targetId
        }
        if (query.targetType) {
            conditions.targetType = query.targetType
        }
        if (query.to) {
            conditions.to = new Date(query.to)
        }

        const page = await db.list({ ...conditions, limit: query.limit, offset: (query.page - 1) * query.limit })

        return {
            data: auditEventListSchema.parse(
                page.records.map((record) => ({
                    ...record,
                    createdAt: record.createdAt.toISOString(),
                    detail: parseDetail(record.detail),
                    sourceIpMasked: maskIp(record.sourceIp),
                })),
            ),
            pagination: {
                limit: query.limit,
                page: query.page,
                total: page.total,
                totalPages: Math.ceil(page.total / query.limit),
            },
        }
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
