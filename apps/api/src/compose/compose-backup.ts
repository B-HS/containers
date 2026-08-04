import { Database } from 'bun:sqlite'
import { BACKUP_RESTORE_MODE, type BackupRestoreMode } from '@containers/contracts/backup'
import { createAppError } from '../lib/error'
import { createBackupService, type BackupServiceDb } from '../service/domain/backup/create-backup-service'
import type { TrafficWorkerClient } from '../service/shared/traffic-worker-client/create-traffic-worker-client'

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const quoteSqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`

const MIGRATION_TABLE = '__drizzle_migrations'

const HOST_PRESERVED_TABLES = new Set([
    MIGRATION_TABLE,
    'account',
    'api_key',
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

const FULL_PRESERVED_TABLES = new Set([MIGRATION_TABLE, 'operation_job', 'operation_job_event'])

const preservedTablesOf = (mode: BackupRestoreMode) => (mode === BACKUP_RESTORE_MODE.FULL ? FULL_PRESERVED_TABLES : HOST_PRESERVED_TABLES)

const getTables = (database: Database, schema = 'main') =>
    database
        .query<{ name: string }, []>(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((record) => record.name)

const normalizeDanglingSetNullReferences = (database: Database, tables: string[]) => {
    for (const table of tables) {
        const foreignKeys = database
            .query<{ from: string; on_delete: string; table: string; to: string | null }, []>(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
            .all()
        for (const foreignKey of foreignKeys) {
            if (foreignKey.on_delete.toUpperCase() !== 'SET NULL') {
                continue
            }
            const column = quoteIdentifier(foreignKey.from)
            const parentColumn = quoteIdentifier(foreignKey.to ?? 'id')
            database.exec(
                `UPDATE main.${quoteIdentifier(table)} SET ${column} = NULL WHERE ${column} IS NOT NULL AND ${column} NOT IN (SELECT ${parentColumn} FROM main.${quoteIdentifier(foreignKey.table)})`,
            )
        }
    }
}

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

    const restoreControlSnapshot = async (filePath: string, mode: BackupRestoreMode) => {
        const tables = getTables(sqlite)
        const preservedTables = preservedTablesOf(mode)
        const replacedTables = tables.filter((table) => !preservedTables.has(table))
        sqlite.exec(`ATTACH DATABASE ${quoteSqlValue(filePath)} AS backup_source`)
        sqlite.exec('PRAGMA foreign_keys = OFF')
        try {
            sqlite.exec('BEGIN IMMEDIATE')
            for (const table of [...replacedTables].reverse()) {
                sqlite.exec(`DELETE FROM main.${quoteIdentifier(table)}`)
            }
            for (const table of replacedTables) {
                sqlite.exec(`INSERT INTO main.${quoteIdentifier(table)} SELECT * FROM backup_source.${quoteIdentifier(table)}`)
            }
            normalizeDanglingSetNullReferences(sqlite, tables)
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
        estimateSnapshotBytes: () => {
            const pageCount = sqlite.query<{ page_count: number }, []>('PRAGMA page_count').get()?.page_count ?? 0
            const pageSize = sqlite.query<{ page_size: number }, []>('PRAGMA page_size').get()?.page_size ?? 0
            return pageCount * pageSize
        },
        restoreControlSnapshot,
        snapshot: () => sqlite.serialize(),
        validateControlSnapshot,
    }
}

type ComposeBackupDependencies = {
    backupRoot: string
    deploymentSecretKeyFile: string
    getAvailableBytes: () => Promise<number>
    minimumAvailableBytes: number
    nginxConfigProvider: () => Promise<string>
    notificationSecretKeyFile: string
    now: () => Date
    retentionCount: number
    sizeMarginRatio: number
    sqlite: Database
    totalQuotaBytes: number
    trafficWorkerClient: Pick<TrafficWorkerClient, 'createBackup' | 'restoreBackup'>
}

export const composeBackup = ({
    backupRoot,
    deploymentSecretKeyFile,
    getAvailableBytes,
    minimumAvailableBytes,
    nginxConfigProvider,
    notificationSecretKeyFile,
    now,
    retentionCount,
    sizeMarginRatio,
    sqlite,
    totalQuotaBytes,
    trafficWorkerClient,
}: ComposeBackupDependencies) => ({
    backupService: createBackupService({
        backupRoot,
        db: buildBackupServiceDb({ sqlite }),
        getAvailableBytes,
        minimumAvailableBytes,
        nginxConfigProvider,
        now,
        retentionCount,
        secretKeyFiles: { deployment: deploymentSecretKeyFile, notification: notificationSecretKeyFile },
        sizeMarginRatio,
        totalQuotaBytes,
        trafficWorkerClient,
    }),
})
