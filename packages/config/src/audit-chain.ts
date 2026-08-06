import { createHash } from 'node:crypto'

export const AUDIT_CHAIN_GENESIS = 'genesis'

type AuditChainEntry = {
    actorId: string | null
    authMethod: string
    createdAt: Date
    detail: string | null
    id: string
    operation: string
    requestId: string
    result: string
    sequence: number
    sourceIp: string | null
    targetId: string | null
    targetType: string
}

const MILLISECONDS_PER_SECOND = 1_000

const canonical = (entry: AuditChainEntry) =>
    JSON.stringify([
        entry.sequence,
        entry.id,
        Math.floor(entry.createdAt.getTime() / MILLISECONDS_PER_SECOND),
        entry.actorId,
        entry.authMethod,
        entry.operation,
        entry.targetType,
        entry.targetId,
        entry.requestId,
        entry.result,
        entry.sourceIp,
        entry.detail,
    ])

/**
 * Derives the tamper-evident hash of an audit entry from its own fields and the hash of the entry
 * before it. Editing or removing any earlier entry changes every hash that follows, so a single
 * stored head hash is enough to detect rewritten history.
 *
 * The timestamp enters the hash as whole seconds because that is the precision the column keeps;
 * hashing milliseconds would make every stored entry fail its own recomputation.
 */
export const computeAuditEntryHash = (entry: AuditChainEntry, previousHash: string) =>
    createHash('sha256').update(previousHash).update('\n').update(canonical(entry)).digest('hex')

/**
 * Walks entries in sequence order and returns the sequence of the first entry whose stored hash
 * does not match a recomputation, or null when the whole run is intact. The first entry is checked
 * against the anchor hash so a run that starts after an archive can still be verified.
 */
export const findAuditChainBreak = (entries: (AuditChainEntry & { entryHash: string; previousHash: string })[], anchorHash: string) => {
    let expectedPrevious = anchorHash
    for (const entry of entries) {
        if (entry.previousHash !== expectedPrevious) return entry.sequence
        if (computeAuditEntryHash(entry, entry.previousHash) !== entry.entryHash) return entry.sequence
        expectedPrevious = entry.entryHash
    }
    return null
}
