import { Database } from 'bun:sqlite'
import { createAppError } from '../lib/error'
import { createBackupService, type BackupServiceDb } from '../service/domain/backup/create-backup-service'
import type { TrafficWorkerClient } from '../service/shared/traffic-worker-client/create-traffic-worker-client'

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const quoteSqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`

const getTables = (database: Database, schema = 'main') =>
    database
        .query<{ name: string }, []>(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((record) => record.name)

const PRESERVED_TABLES = new Set([
    'account',
    'api_key',
    'artifact',
    'audit_log',
    'deployment_secret',
    'invitation',
    'notification_delivery',
    'notification_destination',
    'operation_job',
    'operation_job_event',
    'session',
    'upload_chunk',
    'upload_session',
    'user',
    'user_role',
    'verification',
])

type BuildBackupServiceDbDependencies = {
    sqlite: Database
}

export const buildBackupServiceDb = ({ sqlite }: BuildBackupServiceDbDependencies): BackupServiceDb => {
    const validateControlSnapshot = async (filePath: string) => {
        const source = new Database(filePath, { strict: true })
        try {
            const integrity = source.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()?.integrity_check
            const foreignKeyViolation = source.query('PRAGMA foreign_key_check').get()
            const sourceTables = getTables(source)
            const currentTables = getTables(sqlite)
            if (integrity !== 'ok' || foreignKeyViolation || sourceTables.join(',') !== currentTables.join(',')) {
                throw createAppError('BACKUP_CONTROL_INVALID')
            }
            for (const table of currentTables) {
                const sourceColumns = source.query<{ name: string }, []>(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
                const currentColumns = sqlite.query<{ name: string }, []>(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
                if (sourceColumns.map((column) => column.name).join(',') !== currentColumns.map((column) => column.name).join(',')) {
                    throw createAppError('BACKUP_SCHEMA_MISMATCH')
                }
            }
        } finally {
            source.close()
        }
    }

    const restoreControlSnapshot = async (filePath: string) => {
        const tables = getTables(sqlite)
        sqlite.exec(`ATTACH DATABASE ${quoteSqlValue(filePath)} AS backup_source`)
        sqlite.exec('PRAGMA foreign_keys = OFF')
        try {
            sqlite.exec('BEGIN IMMEDIATE')
            for (const table of [...tables].reverse()) {
                if (!PRESERVED_TABLES.has(table)) {
                    sqlite.exec(`DELETE FROM main.${quoteIdentifier(table)}`)
                }
            }
            for (const table of tables) {
                if (!PRESERVED_TABLES.has(table)) {
                    sqlite.exec(`INSERT INTO main.${quoteIdentifier(table)} SELECT * FROM backup_source.${quoteIdentifier(table)}`)
                }
            }
            const foreignKeyViolation = sqlite.query('PRAGMA foreign_key_check').get()
            if (foreignKeyViolation) {
                throw createAppError('BACKUP_FOREIGN_KEY_INVALID')
            }
            sqlite.exec('COMMIT')
        } catch (error) {
            sqlite.exec('ROLLBACK')
            throw error
        } finally {
            sqlite.exec('PRAGMA foreign_keys = ON')
            sqlite.exec('DETACH DATABASE backup_source')
        }
    }

    return {
        checkForeignKeys: async () => {
            if (sqlite.query('PRAGMA foreign_key_check').get()) {
                throw createAppError('BACKUP_CONTROL_FOREIGN_KEY_INVALID')
            }
        },
        restoreControlSnapshot,
        snapshot: () => sqlite.serialize(),
        validateControlSnapshot,
    }
}

type ComposeBackupDependencies = {
    backupRoot: string
    now: () => Date
    retentionCount: number
    sqlite: Database
    trafficWorkerClient: Pick<TrafficWorkerClient, 'createBackup' | 'restoreBackup'>
}

export const composeBackup = ({ backupRoot, now, retentionCount, sqlite, trafficWorkerClient }: ComposeBackupDependencies) => ({
    backupService: createBackupService({
        backupRoot,
        db: buildBackupServiceDb({ sqlite }),
        now,
        retentionCount,
        trafficWorkerClient,
    }),
})
