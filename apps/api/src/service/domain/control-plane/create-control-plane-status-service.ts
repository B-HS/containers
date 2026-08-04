import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
    CONTROL_PLANE_VERSION,
    controlPlaneMigrationSchema,
    controlPlaneStatusSchema,
    type ControlPlaneMigration,
} from '@containers/contracts/control-plane'
import { createAppError } from '../../../lib/error'
import type { BackupService } from '../backup/create-backup-service'
import type { MaintenanceService } from '../maintenance/create-maintenance-service'

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'cancelling'] as const

type JournalEntry = {
    idx: number
    tag: string
    version: string
    when: number
}

type AppliedMigrationRecord = {
    createdAt: number
    hash: string
}

type ControlPlaneStatusServiceDb = {
    checkIntegrity: () => Promise<string | undefined>
    countActiveJobs: (statuses: string[]) => Promise<number>
    listMigrations: () => Promise<AppliedMigrationRecord[]>
}

type ControlPlaneStatusServiceDependencies = {
    backupService: Pick<BackupService, 'list'>
    db: ControlPlaneStatusServiceDb
    maintenanceService: Pick<MaintenanceService, 'getStatus'>
    migrationsFolder: string
}

export type { ControlPlaneStatusServiceDb, AppliedMigrationRecord }

export const createControlPlaneStatusService = ({
    backupService,
    db,
    maintenanceService,
    migrationsFolder,
}: ControlPlaneStatusServiceDependencies) => {
    const listAppliedMigrations = async (): Promise<AppliedMigrationRecord[]> => {
        try {
            return await db.listMigrations()
        } catch {
            return []
        }
    }

    const readJournal = async (): Promise<JournalEntry[]> => {
        try {
            const journal = (await Bun.file(join(migrationsFolder, 'meta', '_journal.json')).json()) as { entries: JournalEntry[] }
            return journal.entries
        } catch {
            throw createAppError('MIGRATION_JOURNAL_UNAVAILABLE')
        }
    }

    const resolveMigrations = async (): Promise<{ applied: ControlPlaneMigration[]; pending: ControlPlaneMigration[] }> => {
        const entries = await readJournal()
        const appliedByHash = new Map((await listAppliedMigrations()).map((record) => [record.hash, record.createdAt]))
        const applied: ControlPlaneMigration[] = []
        const pending: ControlPlaneMigration[] = []
        for (const entry of entries) {
            const sql = await readFile(join(migrationsFolder, entry.tag + '.sql'), 'utf8')
            const hash = createHash('sha256').update(sql).digest('hex')
            const appliedAt = appliedByHash.get(hash)
            const migration = controlPlaneMigrationSchema.parse({
                appliedAt: appliedAt === undefined ? null : new Date(appliedAt).toISOString(),
                tag: entry.tag,
            })
            if (appliedAt === undefined) {
                pending.push(migration)
            } else {
                applied.push(migration)
            }
        }
        return { applied, pending }
    }

    const getStatus = async () => {
        const [migrations, backups] = await Promise.all([resolveMigrations(), backupService.list()])
        const integrity = await db.checkIntegrity()
        const activeJobCount = await db.countActiveJobs([...ACTIVE_JOB_STATUSES])
        const maintenance = maintenanceService.getStatus()
        return controlPlaneStatusSchema.parse({
            activeJobCount,
            databaseIntegrity: {
                control: integrity ?? 'unavailable',
            },
            lastBackupAt: backups[0]?.createdAt ?? null,
            maintenance,
            migrations,
            version: CONTROL_PLANE_VERSION,
        })
    }

    return { getStatus }
}

export type ControlPlaneStatusService = ReturnType<typeof createControlPlaneStatusService>
