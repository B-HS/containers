import { inArray, sql } from 'drizzle-orm'
import type { Database } from 'bun:sqlite'
import type { ControlDatabase } from '@containers/db-schema/database'
import { operationJob } from '@containers/db-schema/schema'
import type { BackupService } from '../service/domain/backup/create-backup-service'
import type { MaintenanceService } from '../service/domain/maintenance/create-maintenance-service'
import {
    createControlPlaneStatusService,
    type ControlPlaneStatusServiceDb,
} from '../service/domain/control-plane/create-control-plane-status-service'

type ComposeControlPlaneDependencies = {
    db: ControlDatabase
    sqlite: Database
    backupService: Pick<BackupService, 'list'>
    maintenanceService: Pick<MaintenanceService, 'getStatus'>
    migrationsFolder: string
}

export const buildControlPlaneStatusServiceDb = (db: ControlDatabase): ControlPlaneStatusServiceDb => ({
    countActiveJobs: async (statuses) => {
        const [record] = await db
            .select({ count: sql<number>`count(*)` })
            .from(operationJob)
            .where(inArray(operationJob.status, statuses as never))
        return record?.count ?? 0
    },
})

export const composeControlPlane = ({ db, sqlite, backupService, maintenanceService, migrationsFolder }: ComposeControlPlaneDependencies) => ({
    controlPlaneStatusService: createControlPlaneStatusService({
        backupService,
        db: buildControlPlaneStatusServiceDb(db),
        maintenanceService,
        migrationsFolder,
        sqlite,
    }),
})
