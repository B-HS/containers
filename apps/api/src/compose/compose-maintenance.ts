import { eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { maintenanceState } from '@containers/db-schema/schema'
import { createMaintenanceService, type MaintenanceServiceDb } from '../service/domain/maintenance/create-maintenance-service'

const MAINTENANCE_STATE_ID = 'maintenance'

type ComposeMaintenanceDependencies = {
    db: ControlDatabase
    now: () => Date
    sleep: (milliseconds: number) => Promise<void>
}

export const buildMaintenanceServiceDb = (db: ControlDatabase): MaintenanceServiceDb => ({
    clear: (updatedAt) => {
        db.insert(maintenanceState)
            .values({ actorId: null, enabled: false, id: MAINTENANCE_STATE_ID, jobId: null, reason: null, startedAt: null, updatedAt })
            .onConflictDoUpdate({
                set: { actorId: null, enabled: false, jobId: null, reason: null, startedAt: null, updatedAt },
                target: maintenanceState.id,
            })
            .run()
    },
    load: () => {
        const [record] = db.select().from(maintenanceState).where(eq(maintenanceState.id, MAINTENANCE_STATE_ID)).all()
        if (record === undefined || !record.enabled || record.reason === null || record.startedAt === null) {
            return null
        }
        return { actorId: record.actorId, jobId: record.jobId, reason: record.reason, startedAt: record.startedAt }
    },
    save: ({ actorId, jobId, reason, startedAt, updatedAt }) => {
        db.insert(maintenanceState)
            .values({ actorId, enabled: true, id: MAINTENANCE_STATE_ID, jobId, reason, startedAt, updatedAt })
            .onConflictDoUpdate({
                set: { actorId, enabled: true, jobId, reason, startedAt, updatedAt },
                target: maintenanceState.id,
            })
            .run()
    },
})

export const composeMaintenance = ({ db, now, sleep }: ComposeMaintenanceDependencies) => ({
    maintenanceService: createMaintenanceService({ db: buildMaintenanceServiceDb(db), now, sleep }),
})
