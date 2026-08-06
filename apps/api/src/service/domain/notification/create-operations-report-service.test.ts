import { describe, expect, test } from 'bun:test'
import type { AuditIntegrity } from '@containers/contracts/audit'
import { createOperationsReportService, type OperationsReportServiceDb } from './create-operations-report-service'

const NOW = new Date('2026-08-06T00:00:00.000Z')

const INTACT_INTEGRITY: AuditIntegrity = {
    anchorSequence: 0,
    brokenAt: null,
    brokenEntry: null,
    checked: 38,
    headHash: 'a'.repeat(64),
    headSequence: 38,
    unchained: 86,
}

const createDbStub = (overrides: Partial<OperationsReportServiceDb> = {}): OperationsReportServiceDb => ({
    countActiveApiKeys: async () => 1,
    countExpiringApiKeys: async () => 0,
    countLockedAccounts: async () => 0,
    countRecentLockouts: async () => 0,
    summarizeJobs: async () => ({ failedKinds: [], failure: 0, success: 12 }),
    ...overrides,
})

const createTestService = (
    overrides: {
        db?: Partial<OperationsReportServiceDb>
        integrity?: AuditIntegrity
    } = {},
) =>
    createOperationsReportService({
        db: createDbStub(overrides.db),
        listArtifacts: async () => [{ sizeBytes: 26_877_440 }],
        listBackups: async () => [{ controlBytes: 532_480, createdAt: '2026-08-06T04:38:55.943Z' }],
        listContainers: async () => [{ state: 'running' }, { state: 'exited' }],
        now: () => NOW,
        verifyAuditIntegrity: async () => overrides.integrity ?? INTACT_INTEGRITY,
    })

const valueOf = (report: { name: string; value: string }[], name: string) => report.find((field) => field.name === name)?.value

describe('운영 정기 보고', () => {
    test('감사 체인 head 를 보고에 싣는다', async () => {
        const report = await createTestService().build()

        expect(valueOf(report, '감사 체인')).toBe('온전 — 38건 검증')
        expect(valueOf(report, '체인 head')).toBe(`#38 ${'a'.repeat(16)}`)
        expect(valueOf(report, '체인 이전 기록')).toBe('86건')
    })

    test('체인이 끊기면 어느 기록인지 함께 알린다', async () => {
        const report = await createTestService({
            integrity: {
                ...INTACT_INTEGRITY,
                brokenAt: 12,
                brokenEntry: { createdAt: NOW.toISOString(), id: 'entry-12', operation: 'nginx.route.create', result: 'success' },
            },
        }).build()

        expect(valueOf(report, '감사 체인')).toBe('끊김 — 12번 (nginx.route.create)')
    })

    test('보안·운영 지표를 함께 담는다', async () => {
        const report = await createTestService({
            db: {
                countActiveApiKeys: async () => 3,
                countExpiringApiKeys: async () => 1,
                countLockedAccounts: async () => 2,
                countRecentLockouts: async () => 5,
                summarizeJobs: async () => ({ failedKinds: ['deploy.release', 'upload.finalize'], failure: 2, success: 20 }),
            },
        }).build()

        expect(valueOf(report, '작업 24시간')).toBe('성공 20 · 실패 2')
        expect(valueOf(report, '실패한 작업 종류')).toBe('deploy.release, upload.finalize')
        expect(valueOf(report, '로그인 잠금 24시간')).toBe('발생 5건 · 현재 잠김 2건')
        expect(valueOf(report, 'API 키')).toBe('활성 3개 · 30일 내 만료 1개')
        expect(valueOf(report, '컨테이너')).toBe('실행 1 / 전체 2')
        expect(valueOf(report, 'artifact')).toBe('1건 · 26 MiB')
        expect(valueOf(report, '마지막 백업')).toBe('2026-08-06T04:38:55.943Z · 1 MiB')
    })

    test('체인 기록과 백업이 없으면 없음으로 알린다', async () => {
        const service = createOperationsReportService({
            db: createDbStub(),
            listArtifacts: async () => [],
            listBackups: async () => [],
            listContainers: async () => [],
            now: () => NOW,
            verifyAuditIntegrity: async () => ({ ...INTACT_INTEGRITY, checked: 0, headHash: null, headSequence: 0 }),
        })
        const report = await service.build()

        expect(valueOf(report, '체인 head')).toBe('없음')
        expect(valueOf(report, '마지막 백업')).toBe('없음')
    })
})
