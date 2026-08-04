import { CONTROL_PLANE_VERSION } from '@containers/contracts/control-plane'
import { SERVICE_STATUS, readinessSchema, readinessSummarySchema, type Readiness, type ServiceStatus } from '@containers/contracts/health'
import type { BackupSchedule } from '@containers/contracts/operation-job'
import type { MaintenanceService } from '../maintenance/create-maintenance-service'

const SERVICE_NAME = 'api'
const SECOND_MS = 1_000
const HOUR_SECONDS = 60 * 60
const BACKUP_STALENESS_INTERVAL_MULTIPLIER = 2
const INTEGRITY_OK = 'ok'

type ReadinessServiceDb = {
    checkIntegrity: () => Promise<string | undefined>
    countActiveJobs: () => Promise<number>
    countStalledJobs: (heartbeatBefore: Date) => Promise<number>
}

type ReadinessServiceDependencies = {
    backupSchedule: () => Promise<Pick<BackupSchedule, 'intervalHours' | 'lastSuccessAt'>>
    db: ReadinessServiceDb
    jobStallThresholdMs: number
    maintenanceService: Pick<MaintenanceService, 'getStatus'>
    now: () => Date
    probeEngineAgent: () => Promise<ServiceStatus>
    probeTrafficWorker: () => Promise<ServiceStatus>
}

export type { ReadinessServiceDb }

const toStatus = (healthy: boolean) => (healthy ? SERVICE_STATUS.OK : SERVICE_STATUS.DEGRADED)

export const toReadinessSummary = (readiness: Readiness) =>
    readinessSummarySchema.parse({
        checks: Object.fromEntries(Object.entries(readiness.checks).map(([name, check]) => [name, check.status])),
        service: readiness.service,
        status: readiness.status,
        timestamp: readiness.timestamp,
    })

export const createReadinessService = ({
    backupSchedule,
    db,
    jobStallThresholdMs,
    maintenanceService,
    now,
    probeEngineAgent,
    probeTrafficWorker,
}: ReadinessServiceDependencies) => {
    const resolveBackup = async () => {
        const schedule = await backupSchedule().catch(() => null)
        if (schedule === null) {
            return {
                ageSeconds: null,
                lastSuccessAt: null,
                status: SERVICE_STATUS.DEGRADED,
                thresholdSeconds: HOUR_SECONDS,
            }
        }
        const thresholdSeconds = schedule.intervalHours * BACKUP_STALENESS_INTERVAL_MULTIPLIER * HOUR_SECONDS
        if (schedule.lastSuccessAt === null) {
            return { ageSeconds: null, lastSuccessAt: null, status: SERVICE_STATUS.DEGRADED, thresholdSeconds }
        }
        const ageSeconds = Math.max(0, Math.floor((now().getTime() - Date.parse(schedule.lastSuccessAt)) / SECOND_MS))
        return {
            ageSeconds,
            lastSuccessAt: schedule.lastSuccessAt,
            status: toStatus(ageSeconds <= thresholdSeconds),
            thresholdSeconds,
        }
    }

    const resolveControlDatabase = async () => {
        const integrity = (await db.checkIntegrity().catch(() => undefined)) ?? 'unavailable'
        return { integrity, status: toStatus(integrity === INTEGRITY_OK) }
    }

    const resolveJobs = async () => {
        const cutoff = new Date(now().getTime() - jobStallThresholdMs)
        const [active, stalled] = await Promise.all([db.countActiveJobs().catch(() => 0), db.countStalledJobs(cutoff).catch(() => 0)])
        return { active, stalled, status: toStatus(stalled === 0) }
    }

    const getReadiness = async () => {
        const maintenance = maintenanceService.getStatus()
        const [backup, controlDatabase, engineAgentStatus, jobs, trafficWorkerStatus] = await Promise.all([
            resolveBackup(),
            resolveControlDatabase(),
            probeEngineAgent(),
            resolveJobs(),
            probeTrafficWorker(),
        ])
        const checks = {
            backup,
            controlDatabase,
            engineAgent: { status: engineAgentStatus },
            jobs,
            maintenance: { enabled: maintenance.enabled, status: toStatus(!maintenance.enabled) },
            trafficWorker: { status: trafficWorkerStatus },
        }
        const degraded = Object.values(checks).some((check) => check.status === SERVICE_STATUS.DEGRADED)
        return readinessSchema.parse({
            checks,
            service: SERVICE_NAME,
            status: degraded ? SERVICE_STATUS.DEGRADED : SERVICE_STATUS.OK,
            timestamp: now().toISOString(),
            version: CONTROL_PLANE_VERSION,
        })
    }

    return { getReadiness }
}

export type ReadinessService = ReturnType<typeof createReadinessService>
