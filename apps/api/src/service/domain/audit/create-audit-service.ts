import { randomUUID } from 'node:crypto'
import { AUDIT_CHAIN_GENESIS, findAuditChainBreak } from '@containers/config/audit-chain'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
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

type AuditArchiveRecord = Omit<AuditListRecord, 'actorEmail'>

type AuditChainRow = {
    actorId: string | null
    authMethod: string
    createdAt: Date
    detail: string | null
    entryHash: string
    id: string
    operation: string
    previousHash: string
    requestId: string
    result: string
    sequence: number
    sourceIp: string | null
    targetId: string | null
    targetType: string
}

type AuditServiceDb = {
    countUnchained: () => Promise<number>
    listChainAfter: (sequence: number, limit: number) => Promise<AuditChainRow[]>
    readAnchor: () => Promise<{ hash: string; sequence: number } | undefined>
    list: (query: AuditListQuery) => Promise<AuditListPage>
    listBefore: (threshold: Date, limit: number) => Promise<AuditArchiveRecord[]>
    deleteByIds: (ids: string[]) => Promise<void>
    record: (record: AuditInsertRecord) => Promise<void>
}

type AuditRecord = {
    actorId: string
    authMethod?: 'api-key' | 'bootstrap' | 'invitation' | 'session'
    detail?: Record<string, unknown>
    operation: string
    requestId: string
    result: AuditResult
    sourceIp: string | undefined
    targetId: string
    targetType: AuditTargetType
}

type AuditServiceDependencies = {
    archiveRoot: string
    db: AuditServiceDb
    now: () => Date
    retentionDays: number
}

export type { AuditServiceDb }

const ARCHIVE_BATCH_SIZE = 1_000
const ARCHIVE_FILE_MODE = 0o600
const DAY_MS = 24 * 60 * 60 * 1_000

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

export const createAuditService = ({ archiveRoot, db, now, retentionDays }: AuditServiceDependencies) => ({
    archiveExpired: async () => {
        const threshold = new Date(now().getTime() - retentionDays * DAY_MS)
        let archivedCount = 0
        for (;;) {
            const records = await db.listBefore(threshold, ARCHIVE_BATCH_SIZE)
            if (records.length === 0) {
                break
            }
            await mkdir(archiveRoot, { recursive: true })
            const filePath = join(archiveRoot, `audit-${threshold.toISOString().slice(0, 10)}.jsonl`)
            const handle = await open(filePath, 'a', ARCHIVE_FILE_MODE)
            try {
                await handle.write(records.map((record) => `${JSON.stringify({ ...record, createdAt: record.createdAt.toISOString() })}\n`).join(''))
            } finally {
                await handle.close()
            }
            await db.deleteByIds(records.map((record) => record.id))
            archivedCount += records.length
            if (records.length < ARCHIVE_BATCH_SIZE) {
                break
            }
        }
        return archivedCount
    },
    verifyIntegrity: async () => {
        const anchor = await db.readAnchor()
        let expectedPrevious = anchor?.hash ?? AUDIT_CHAIN_GENESIS
        let cursor = anchor?.sequence ?? 0
        let checked = 0
        for (;;) {
            const entries = await db.listChainAfter(cursor, ARCHIVE_BATCH_SIZE)
            if (entries.length === 0) {
                break
            }
            const brokenAt = findAuditChainBreak(entries, expectedPrevious)
            if (brokenAt !== null) {
                const broken = entries.find((entry) => entry.sequence === brokenAt)
                return {
                    anchorSequence: anchor?.sequence ?? 0,
                    brokenAt,
                    brokenEntry:
                        broken === undefined
                            ? null
                            : { createdAt: broken.createdAt.toISOString(), id: broken.id, operation: broken.operation, result: broken.result },
                    checked: checked + entries.length,
                    unchained: await db.countUnchained(),
                }
            }
            const last = entries[entries.length - 1]
            if (last === undefined) {
                break
            }
            expectedPrevious = last.entryHash
            cursor = last.sequence
            checked += entries.length
            if (entries.length < ARCHIVE_BATCH_SIZE) {
                break
            }
        }
        return { anchorSequence: anchor?.sequence ?? 0, brokenAt: null, brokenEntry: null, checked, unchained: await db.countUnchained() }
    },
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
