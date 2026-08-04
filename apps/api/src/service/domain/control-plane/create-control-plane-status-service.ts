import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
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

type ControlPlaneStatusServiceDb = {
    countActiveJobs: (statuses: string[]) => Promise<number>
}

type ControlPlaneStatusServiceDependencies = {
    backupService: Pick<BackupService, 'list'>
    db: ControlPlaneStatusServiceDb
    maintenanceService: Pick<MaintenanceService, 'getStatus'>
    migrationsFolder: string
    sqlite: Database
}

export type { ControlPlaneStatusServiceDb }

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

export const createControlPlaneStatusService = ({
    backupService,
    db,
    maintenanceService,
    migrationsFolder,
    sqlite,
}: ControlPlaneStatusServiceDependencies) => {
    const listAppliedMigrations = async (): Promise<AppliedMigrationRecord[]> => {
        try {
            return (await sqlite.query('SELECT hash, created_at AS createdAt FROM __drizzle_migrations').all()) as AppliedMigrationRecord[]
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
            const sql = await readFile(join(migrationsFolder, `${entry.tag}.sql`), 'utf8')
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
        const integrity = (await sqlite.query('PRAGMA integrity_check').get()) as { integrity_check: string }
        const activeJobCount = await db.countActiveJobs([...ACTIVE_JOB_STATUSES])
        const maintenance = maintenanceService.getStatus()
        return controlPlaneStatusSchema.parse({
            activeJobCount,
            databaseIntegrity: {
                control: integrity?.integrity_check ?? 'unavailable',
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
