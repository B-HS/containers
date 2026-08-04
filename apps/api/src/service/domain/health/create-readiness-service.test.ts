import { describe, expect, test } from 'bun:test'
import { SERVICE_STATUS } from '@containers/contracts/health'
import { createAppError } from '../../../lib/error'
import { createReadinessService, toReadinessSummary } from './create-readiness-service'

const NOW = new Date('2026-08-01T12:00:00.000Z')
const STALL_THRESHOLD_MS = 90_000

const createService = (overrides: Partial<Parameters<typeof createReadinessService>[0]> = {}) =>
    createReadinessService({
        backupSchedule: async () => ({ intervalHours: 24, lastSuccessAt: '2026-08-01T06:00:00.000Z' }),
        db: {
            checkIntegrity: async () => 'ok',
            countActiveJobs: async () => 0,
            countStalledJobs: async () => 0,
        },
        jobStallThresholdMs: STALL_THRESHOLD_MS,
        maintenanceService: { getStatus: () => ({ actorId: null, enabled: false, jobId: null, reason: null, startedAt: null }) },
        now: () => NOW,
        probeEngineAgent: async () => SERVICE_STATUS.OK,
        probeTrafficWorker: async () => SERVICE_STATUS.OK,
        ...overrides,
    })

describe('readiness service', () => {
    test('모든 의존 구성요소가 정상이면 ok 를 반환합니다', async () => {
        const readiness = await createService().getReadiness()

        expect(readiness.status).toBe(SERVICE_STATUS.OK)
        expect(readiness.checks.backup.ageSeconds).toBe(21_600)
        expect(readiness.checks.backup.thresholdSeconds).toBe(172_800)
        expect(readiness.checks.controlDatabase.integrity).toBe('ok')
    })

    test('engine-agent 도달 실패는 degraded 로 판정합니다', async () => {
        const readiness = await createService({ probeEngineAgent: async () => SERVICE_STATUS.DEGRADED }).getReadiness()

        expect(readiness.checks.engineAgent.status).toBe(SERVICE_STATUS.DEGRADED)
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('traffic-worker 도달 실패는 degraded 로 판정합니다', async () => {
        const readiness = await createService({ probeTrafficWorker: async () => SERVICE_STATUS.DEGRADED }).getReadiness()

        expect(readiness.checks.trafficWorker.status).toBe(SERVICE_STATUS.DEGRADED)
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('control DB integrity 이상은 degraded 로 판정합니다', async () => {
        const readiness = await createService({
            db: { checkIntegrity: async () => 'malformed database', countActiveJobs: async () => 0, countStalledJobs: async () => 0 },
        }).getReadiness()

        expect(readiness.checks.controlDatabase).toEqual({ integrity: 'malformed database', status: SERVICE_STATUS.DEGRADED })
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('integrity 조회 자체가 실패하면 unavailable 로 degraded 판정합니다', async () => {
        const readiness = await createService({
            db: {
                checkIntegrity: async () => {
                    throw createAppError('CONTROL_PLANE_STATUS_FAILED')
                },
                countActiveJobs: async () => 0,
                countStalledJobs: async () => 0,
            },
        }).getReadiness()

        expect(readiness.checks.controlDatabase.integrity).toBe('unavailable')
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('마지막 성공 백업이 임계 시간을 넘기면 degraded 로 판정합니다', async () => {
        const readiness = await createService({
            backupSchedule: async () => ({ intervalHours: 24, lastSuccessAt: '2026-07-28T12:00:00.000Z' }),
        }).getReadiness()

        expect(readiness.checks.backup.status).toBe(SERVICE_STATUS.DEGRADED)
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('성공한 백업이 한 번도 없으면 degraded 로 판정합니다', async () => {
        const readiness = await createService({ backupSchedule: async () => ({ intervalHours: 24, lastSuccessAt: null }) }).getReadiness()

        expect(readiness.checks.backup).toMatchObject({ ageSeconds: null, lastSuccessAt: null, status: SERVICE_STATUS.DEGRADED })
    })

    test('stalled job 이 있으면 degraded 로 판정하고 job 수를 노출합니다', async () => {
        const cutoffs: Date[] = []
        const readiness = await createService({
            db: {
                checkIntegrity: async () => 'ok',
                countActiveJobs: async () => 3,
                countStalledJobs: async (heartbeatBefore) => {
                    cutoffs.push(heartbeatBefore)
                    return 2
                },
            },
        }).getReadiness()

        expect(readiness.checks.jobs).toEqual({ active: 3, stalled: 2, status: SERVICE_STATUS.DEGRADED })
        expect(cutoffs[0]?.getTime()).toBe(NOW.getTime() - STALL_THRESHOLD_MS)
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('maintenance 모드는 degraded 로 판정합니다', async () => {
        const readiness = await createService({
            maintenanceService: {
                getStatus: () => ({ actorId: 'owner', enabled: true, jobId: null, reason: 'restore', startedAt: NOW.toISOString() }),
            },
        }).getReadiness()

        expect(readiness.checks.maintenance).toEqual({ enabled: true, status: SERVICE_STATUS.DEGRADED })
        expect(readiness.status).toBe(SERVICE_STATUS.DEGRADED)
    })

    test('요약 응답은 check 별 status 만 노출합니다', async () => {
        const readiness = await createService({ probeEngineAgent: async () => SERVICE_STATUS.DEGRADED }).getReadiness()

        const summary = toReadinessSummary(readiness)

        expect(summary).toEqual({
            checks: {
                backup: SERVICE_STATUS.OK,
                controlDatabase: SERVICE_STATUS.OK,
                engineAgent: SERVICE_STATUS.DEGRADED,
                jobs: SERVICE_STATUS.OK,
                maintenance: SERVICE_STATUS.OK,
                trafficWorker: SERVICE_STATUS.OK,
            },
            service: 'api',
            status: SERVICE_STATUS.DEGRADED,
            timestamp: NOW.toISOString(),
        })
        expect(JSON.stringify(summary)).not.toContain('0.1.0')
    })
})
