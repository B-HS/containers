import { describe, expect, test } from 'bun:test'
import { AUDIT_CHAIN_GENESIS, computeAuditEntryHash, findAuditChainBreak } from './audit-chain'

const baseEntry = {
    actorId: 'user-1',
    authMethod: 'session',
    createdAt: new Date('2026-08-06T00:00:00.000Z'),
    detail: null,
    id: 'entry-1',
    operation: 'nginx.route.create',
    requestId: 'request-1',
    result: 'success',
    sequence: 1,
    sourceIp: '203.0.113.0',
    targetId: 'route-1',
    targetType: 'nginx-route',
}

const chain = (count: number) => {
    const entries = []
    let previousHash = AUDIT_CHAIN_GENESIS
    for (let index = 0; index < count; index += 1) {
        const entry = { ...baseEntry, id: `entry-${index + 1}`, sequence: index + 1 }
        const entryHash = computeAuditEntryHash(entry, previousHash)
        entries.push({ ...entry, entryHash, previousHash })
        previousHash = entryHash
    }
    return entries
}

describe('감사 로그 해시 체인', () => {
    test('같은 항목과 같은 이전 해시는 같은 해시를 낸다', () => {
        expect(computeAuditEntryHash(baseEntry, AUDIT_CHAIN_GENESIS)).toBe(computeAuditEntryHash({ ...baseEntry }, AUDIT_CHAIN_GENESIS))
    })

    test('항목이 하나라도 달라지면 해시가 달라진다', () => {
        const original = computeAuditEntryHash(baseEntry, AUDIT_CHAIN_GENESIS)
        expect(computeAuditEntryHash({ ...baseEntry, result: 'failure' }, AUDIT_CHAIN_GENESIS)).not.toBe(original)
        expect(computeAuditEntryHash({ ...baseEntry, actorId: 'user-2' }, AUDIT_CHAIN_GENESIS)).not.toBe(original)
        expect(computeAuditEntryHash(baseEntry, 'other-previous')).not.toBe(original)
    })

    test('같은 초 안의 밀리초 차이는 해시를 바꾸지 않는다 — 컬럼이 초까지만 보관한다', () => {
        const withMilliseconds = { ...baseEntry, createdAt: new Date('2026-08-06T00:00:00.750Z') }

        expect(computeAuditEntryHash(withMilliseconds, AUDIT_CHAIN_GENESIS)).toBe(computeAuditEntryHash(baseEntry, AUDIT_CHAIN_GENESIS))
        expect(computeAuditEntryHash({ ...baseEntry, createdAt: new Date('2026-08-06T00:00:01.000Z') }, AUDIT_CHAIN_GENESIS)).not.toBe(
            computeAuditEntryHash(baseEntry, AUDIT_CHAIN_GENESIS),
        )
    })

    test('온전한 체인은 끊긴 지점이 없다', () => {
        expect(findAuditChainBreak(chain(5), AUDIT_CHAIN_GENESIS)).toBeNull()
    })

    test('중간 항목을 고치면 그 지점을 짚는다', () => {
        const entries = chain(5)
        const target = entries[2]
        if (target === undefined) throw new Error('테스트 데이터가 잘못되었습니다.')
        entries[2] = { ...target, result: 'failure' }

        expect(findAuditChainBreak(entries, AUDIT_CHAIN_GENESIS)).toBe(3)
    })

    test('중간 항목을 지우면 그다음 항목에서 끊김이 드러난다', () => {
        const entries = chain(5).filter((entry) => entry.sequence !== 3)

        expect(findAuditChainBreak(entries, AUDIT_CHAIN_GENESIS)).toBe(4)
    })

    test('시작 앵커가 다르면 첫 항목에서 끊긴다', () => {
        expect(findAuditChainBreak(chain(3), 'wrong-anchor')).toBe(1)
    })
})
