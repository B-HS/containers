import type { Database } from 'bun:sqlite'
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { operationJob } from '@containers/db-schema/schema'
import type { BackupSchedule } from '@containers/contracts/operation-job'
import { createReadinessService, type ReadinessServiceDb } from '../service/domain/health/create-readiness-service'
import { createServiceHealthProbe } from '../service/domain/health/create-service-health-probe'
import { STALL_THRESHOLD_MS } from '../service/domain/job/create-operation-job-service'
import type { MaintenanceService } from '../service/domain/maintenance/create-maintenance-service'

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'cancelling']
const RUNNING_JOB_STATUS = 'running'

type ComposeHealthDependencies = {
    agentInternalUrl: string
    backupSchedule: () => Promise<Pick<BackupSchedule, 'intervalHours' | 'lastSuccessAt'>>
    db: ControlDatabase
    maintenanceService: Pick<MaintenanceService, 'getStatus'>
    now: () => Date
    sqlite: Database
    trafficWorkerInternalUrl: string
}

export const buildReadinessServiceDb = (db: ControlDatabase, sqlite: Database): ReadinessServiceDb => ({
    checkIntegrity: async () => {
        const record = (await sqlite.query('PRAGMA integrity_check').get()) as { integrity_check?: string } | undefined
        return record?.integrity_check
    },
    countActiveJobs: async () => {
        const [record] = await db
            .select({ count: sql<number>`count(*)` })
            .from(operationJob)
            .where(inArray(operationJob.status, ACTIVE_JOB_STATUSES as never))
        return record?.count ?? 0
    },
    countStalledJobs: async (heartbeatBefore) => {
        const [record] = await db
            .select({ count: sql<number>`count(*)` })
            .from(operationJob)
            .where(
                and(eq(operationJob.status, RUNNING_JOB_STATUS), isNotNull(operationJob.heartbeatAt), lt(operationJob.heartbeatAt, heartbeatBefore)),
            )
        return record?.count ?? 0
    },
})

export const composeHealth = ({
    agentInternalUrl,
    backupSchedule,
    db,
    maintenanceService,
    now,
    sqlite,
    trafficWorkerInternalUrl,
}: ComposeHealthDependencies) => ({
    readinessService: createReadinessService({
        backupSchedule,
        db: buildReadinessServiceDb(db, sqlite),
        jobStallThresholdMs: STALL_THRESHOLD_MS,
        maintenanceService,
        now,
        probeEngineAgent: createServiceHealthProbe({ baseUrl: agentInternalUrl }),
        probeTrafficWorker: createServiceHealthProbe({ baseUrl: trafficWorkerInternalUrl }),
    }),
})
