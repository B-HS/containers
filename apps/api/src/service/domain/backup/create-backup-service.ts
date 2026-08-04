import { Database } from 'bun:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
    backupCreateSchema,
    backupDeleteSchema,
    backupListSchema,
    backupManifestSchema,
    backupRestoreSchema,
    type BackupManifest,
} from '@containers/contracts/backup'
import { createAppError } from '../../../lib/error'
import type { TrafficWorkerClient } from '../../../traffic/create-traffic-worker-client'

type BackupServiceDependencies = {
    backupRoot: string
    now: () => Date
    retentionCount: number
    sqlite: Database
    trafficWorkerClient: Pick<TrafficWorkerClient, 'createBackup' | 'restoreBackup'>
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const quoteSqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`

const getTables = (database: Database, schema = 'main') =>
    database
        .query<{ name: string }, []>(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((record) => record.name)

const validateControlSnapshot = async (sqlite: Database, filePath: string) => {
    const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer())
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
    return bytes
}

const sha256File = async (filePath: string) => {
    const hash = createHash('sha256')
    const reader = Bun.file(filePath).stream().getReader()
    while (true) {
        const result = await reader.read()
        if (result.done) {
            break
        }
        hash.update(result.value)
    }
    return hash.digest('hex')
}

const restoreControlSnapshot = (sqlite: Database, filePath: string) => {
    const tables = getTables(sqlite)
    const preservedTables = new Set([
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
    sqlite.exec(`ATTACH DATABASE ${quoteSqlValue(filePath)} AS backup_source`)
    sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
        sqlite.exec('BEGIN IMMEDIATE')
        for (const table of [...tables].reverse()) {
            if (!preservedTables.has(table)) {
                sqlite.exec(`DELETE FROM main.${quoteIdentifier(table)}`)
            }
        }
        for (const table of tables) {
            if (!preservedTables.has(table)) {
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

export const createBackupService = ({ backupRoot, now, retentionCount, sqlite, trafficWorkerClient }: BackupServiceDependencies) => {
    const manifestPath = (id: string) => join(backupRoot, id, 'manifest.json')
    const controlPath = (id: string) => join(backupRoot, id, 'control.sqlite')
    const trafficPath = (id: string) => join(backupRoot, id, 'traffic.sqlite')

    const list = async () => {
        await mkdir(backupRoot, { recursive: true })
        const entries = await readdir(backupRoot, { withFileTypes: true })
        const manifests = await Promise.all(
            entries
                .filter((entry) => entry.isDirectory())
                .map(async (entry) => {
                    try {
                        return backupManifestSchema.parse(await Bun.file(manifestPath(entry.name)).json())
                    } catch {
                        return undefined
                    }
                }),
        )
        return backupListSchema.parse(
            manifests
                .filter((manifest): manifest is BackupManifest => Boolean(manifest))
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        )
    }

    const cleanupRetention = async () => {
        const expired = (await list()).slice(retentionCount)
        await Promise.all(expired.map((manifest) => rm(join(backupRoot, manifest.id), { force: true, recursive: true })))
    }

    const createSnapshot = async (input: unknown, applyRetention: boolean) => {
        const payload = backupCreateSchema.parse(input)
        if (sqlite.query('PRAGMA foreign_key_check').get()) {
            throw createAppError('BACKUP_CONTROL_FOREIGN_KEY_INVALID')
        }
        const id = randomUUID()
        const directory = join(backupRoot, id)
        await mkdir(directory, { recursive: true })
        try {
            const traffic = await trafficWorkerClient.createBackup(id)
            const controlSnapshot = sqlite.serialize()
            const controlDestination = controlPath(id)
            await Bun.write(`${controlDestination}.tmp`, controlSnapshot)
            await rename(`${controlDestination}.tmp`, controlDestination)
            const manifest = backupManifestSchema.parse({
                controlBytes: controlSnapshot.byteLength,
                controlSha256: createHash('sha256').update(controlSnapshot).digest('hex'),
                createdAt: now().toISOString(),
                id,
                label: payload.label,
                schemaVersion: 1,
                trafficBytes: traffic.bytes,
                trafficSha256: traffic.sha256,
            })
            const temporaryManifest = `${manifestPath(id)}.tmp`
            await Bun.write(temporaryManifest, JSON.stringify(manifest))
            await rename(temporaryManifest, manifestPath(id))
            if (applyRetention) {
                await cleanupRetention()
            }
            return manifest
        } catch (error) {
            await rm(directory, { force: true, recursive: true })
            throw error
        }
    }

    const getVerified = async (id: string) => {
        let manifest: BackupManifest
        try {
            manifest = backupManifestSchema.parse(await Bun.file(manifestPath(id)).json())
        } catch {
            throw createAppError('BACKUP_NOT_FOUND')
        }
        const [controlStat, trafficStat, controlSha256, trafficSha256] = await Promise.all([
            stat(controlPath(id)),
            stat(trafficPath(id)),
            sha256File(controlPath(id)),
            sha256File(trafficPath(id)),
        ]).catch(() => {
            throw createAppError('BACKUP_INCOMPLETE')
        })
        if (
            controlStat.size !== manifest.controlBytes ||
            trafficStat.size !== manifest.trafficBytes ||
            controlSha256 !== manifest.controlSha256 ||
            trafficSha256 !== manifest.trafficSha256
        ) {
            throw createAppError('BACKUP_DIGEST_MISMATCH')
        }
        await validateControlSnapshot(sqlite, controlPath(id))
        return manifest
    }

    return {
        create: (input: unknown) => createSnapshot(input, true),
        list,
        remove: async (id: string, input: unknown) => {
            const payload = backupDeleteSchema.parse(input)
            if (payload.confirmation !== id) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            try {
                const manifest = backupManifestSchema.parse(await Bun.file(manifestPath(id)).json())
                if (manifest.id !== id) {
                    throw createAppError('BACKUP_NOT_FOUND')
                }
            } catch (error) {
                throw createAppError('BACKUP_NOT_FOUND', error)
            }
            await rm(join(backupRoot, id), { recursive: true })
            return { removed: true as const }
        },
        restore: async (id: string, input: unknown) => {
            const payload = backupRestoreSchema.parse(input)
            if (payload.confirmation !== id) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            const manifest = await getVerified(id)
            const recovery = await createSnapshot({ label: `pre-restore:${id}` }, false)
            try {
                const traffic = await trafficWorkerClient.restoreBackup(id)
                if (traffic.bytes !== manifest.trafficBytes || traffic.sha256 !== manifest.trafficSha256) {
                    throw createAppError('BACKUP_TRAFFIC_DIGEST_MISMATCH')
                }
                restoreControlSnapshot(sqlite, controlPath(id))
                await cleanupRetention()
                return { backup: manifest, recoveryBackupId: recovery.id, restored: true as const }
            } catch (error) {
                try {
                    await trafficWorkerClient.restoreBackup(recovery.id)
                    restoreControlSnapshot(sqlite, controlPath(recovery.id))
                } catch (rollbackError) {
                    console.error(
                        JSON.stringify({
                            event: 'backup.restore.rollback_failed',
                            originalCode: error instanceof Error ? error.message.split(':')[0] : 'BACKUP_RESTORE_FAILED',
                            rollbackCode: rollbackError instanceof Error ? rollbackError.message.split(':')[0] : 'BACKUP_ROLLBACK_FAILED',
                        }),
                    )
                    throw createAppError('BACKUP_RESTORE_ROLLBACK_FAILED', rollbackError)
                }
                throw error
            }
        },
    }
}

export type BackupService = ReturnType<typeof createBackupService>
