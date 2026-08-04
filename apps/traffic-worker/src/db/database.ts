import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import type { NginxAccessEvent } from '@containers/contracts/traffic'
import { createAppError } from '@/lib/error'
import { createTrafficReadQueries } from './read-queries'
import { accessEvent, schema } from './schema'

type TrafficDatabaseDependencies = {
    filePath: string
    migrationsFolder: string
}

const ACCESS_EVENT_COLUMNS = [
    'request_id',
    'occurred_at',
    'client_ip',
    'host',
    'method',
    'uri_path',
    'status',
    'request_time_ms',
    'bytes_sent',
    'country',
    'user_agent',
] as const

const LEGACY_ACCESS_EVENT_COLUMNS = [...ACCESS_EVENT_COLUMNS, 'raw_json'] as const

const STORAGE_RECLAIM_VERSION = 1

export const createTrafficDatabase = ({ filePath, migrationsFolder }: TrafficDatabaseDependencies) => {
    const sqlite = new Database(filePath, { create: true, strict: true })

    sqlite.exec('PRAGMA journal_mode = WAL')
    sqlite.exec('PRAGMA busy_timeout = 5000')

    const db = drizzle({ client: sqlite, schema })
    migrate(db, { migrationsFolder })

    const pragmaValue = (name: string) => sqlite.query<Record<string, number>, []>(`PRAGMA ${name}`).get()?.[name] ?? 0

    if (pragmaValue('user_version') < STORAGE_RECLAIM_VERSION) {
        sqlite.exec('VACUUM')
        sqlite.exec(`PRAGMA user_version = ${STORAGE_RECLAIM_VERSION}`)
    }

    const insertEvents = (events: NginxAccessEvent[]) => {
        if (events.length === 0) return []
        return db.transaction((tx) =>
            tx
                .insert(accessEvent)
                .values(
                    events.map((event) => ({
                        requestId: event.request_id,
                        occurredAt: new Date(event.timestamp).getTime(),
                        clientIp: event.client_ip,
                        host: event.host,
                        method: event.method,
                        uriPath: event.uri_path,
                        status: event.status,
                        requestTimeMs: event.request_time * 1_000,
                        bytesSent: event.bytes_sent,
                        country: event.country,
                        userAgent: event.user_agent,
                    })),
                )
                .onConflictDoNothing()
                .returning({ requestId: accessEvent.requestId })
                .all()
                .map((row) => row.requestId),
        )
    }

    const readQueries = createTrafficReadQueries(sqlite)

    const deleteOldest = (rowCount: number) => {
        if (rowCount <= 0) return 0
        return sqlite.run(
            'DELETE FROM access_event WHERE request_id IN (SELECT request_id FROM access_event ORDER BY occurred_at ASC, request_id ASC LIMIT ?1)',
            [rowCount],
        ).changes
    }

    return {
        ...readQueries,
        close: () => sqlite.close(),
        deleteBefore: (timestamp: number) => sqlite.run('DELETE FROM access_event WHERE occurred_at < ?1', [timestamp]).changes,
        deleteOldest,
        getStorageStats: () => {
            const pageSize = pragmaValue('page_size')
            return {
                byteSize: pragmaValue('page_count') * pageSize,
                reclaimableByteSize: pragmaValue('freelist_count') * pageSize,
                rowCount: readQueries.getRowCount(),
            }
        },
        vacuum: () => sqlite.exec('VACUUM'),
        insertEvents,
        restoreSnapshot: (filePath: string) => {
            const source = new Database(filePath, { strict: true })
            try {
                const integrity = source.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()?.integrity_check
                const columns = source
                    .query<{ name: string }, []>('PRAGMA table_info(access_event)')
                    .all()
                    .map((column) => column.name)
                    .join(',')
                if (integrity !== 'ok' || (columns !== ACCESS_EVENT_COLUMNS.join(',') && columns !== LEGACY_ACCESS_EVENT_COLUMNS.join(','))) {
                    throw createAppError('BACKUP_TRAFFIC_INVALID')
                }
            } finally {
                source.close()
            }

            const escapedPath = filePath.replaceAll("'", "''")
            sqlite.exec(`ATTACH DATABASE '${escapedPath}' AS backup_source`)
            try {
                sqlite.transaction(() => {
                    sqlite.exec('DELETE FROM access_event')
                    sqlite.exec(
                        `INSERT INTO access_event (${ACCESS_EVENT_COLUMNS.join(',')}) SELECT ${ACCESS_EVENT_COLUMNS.join(',')} FROM backup_source.access_event`,
                    )
                })()
            } finally {
                sqlite.exec('DETACH DATABASE backup_source')
            }
        },
        serializeSnapshot: () => sqlite.serialize(),
    }
}

export type TrafficDatabase = ReturnType<typeof createTrafficDatabase>
