import { Database } from 'bun:sqlite'
import type { NginxAccessEvent } from '@containers/contracts/traffic'

type TrafficDatabaseDependencies = {
    filePath: string
}

type TrafficFilter = {
    pathPrefix: string
    since: number
    statusMaximum: number
    statusMinimum: number
}

const filterParameters = (filter: TrafficFilter) =>
    [filter.since, filter.statusMinimum, filter.statusMaximum, filter.pathPrefix, filter.pathPrefix] as const

const FILTER_SQL = "occurred_at >= ? AND status BETWEEN ? AND ? AND (? = '' OR instr(uri_path, ?) = 1)"

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
    'raw_json',
] as const

export const createTrafficDatabase = ({ filePath }: TrafficDatabaseDependencies) => {
    const database = new Database(filePath, { create: true, strict: true })

    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA busy_timeout = 5000')
    database.exec(`
        CREATE TABLE IF NOT EXISTS access_event (
            request_id TEXT PRIMARY KEY,
            occurred_at INTEGER NOT NULL,
            client_ip TEXT NOT NULL,
            host TEXT NOT NULL,
            method TEXT NOT NULL,
            uri_path TEXT NOT NULL,
            status INTEGER NOT NULL,
            request_time_ms REAL NOT NULL,
            bytes_sent INTEGER NOT NULL,
            country TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            raw_json TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS access_event_occurred_at_idx ON access_event(occurred_at);
        CREATE INDEX IF NOT EXISTS access_event_status_idx ON access_event(status);
    `)

    const insertStatement = database.prepare(`
        INSERT OR IGNORE INTO access_event (
            request_id, occurred_at, client_ip, host, method, uri_path, status,
            request_time_ms, bytes_sent, country, user_agent, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = database.transaction((events: NginxAccessEvent[]) => {
        const insertedRequestIds: string[] = []
        for (const event of events) {
            const result = insertStatement.run(
                event.request_id,
                new Date(event.timestamp).getTime(),
                event.client_ip,
                event.host,
                event.method,
                event.uri_path,
                event.status,
                event.request_time * 1_000,
                event.bytes_sent,
                event.country,
                event.user_agent,
                JSON.stringify(event),
            )
            if (result.changes === 1) insertedRequestIds.push(event.request_id)
        }
        return insertedRequestIds
    })

    return {
        close: () => database.close(),
        deleteBefore: (timestamp: number) => database.run('DELETE FROM access_event WHERE occurred_at < ?', [timestamp]),
        getSummary: (since: number) =>
            database
                .query<
                    {
                        averageResponseTimeMs: number
                        bytesSent: number
                        clientErrorCount: number
                        requestCount: number
                        serverErrorCount: number
                    },
                    [number]
                >(
                    `SELECT
                        count(*) AS requestCount,
                        coalesce(sum(bytes_sent), 0) AS bytesSent,
                        coalesce(avg(request_time_ms), 0) AS averageResponseTimeMs,
                        coalesce(sum(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END), 0) AS clientErrorCount,
                        coalesce(sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END), 0) AS serverErrorCount
                    FROM access_event WHERE occurred_at >= ?`,
                )
                .get(since),
        getAnalyticsSummary: (filter: TrafficFilter) =>
            database
                .query<
                    {
                        averageResponseTimeMs: number
                        bytesSent: number
                        clientErrorCount: number
                        requestCount: number
                        serverErrorCount: number
                    },
                    [number, number, number, string, string]
                >(
                    `SELECT
                        count(*) AS requestCount,
                        coalesce(sum(bytes_sent), 0) AS bytesSent,
                        coalesce(avg(request_time_ms), 0) AS averageResponseTimeMs,
                        coalesce(sum(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END), 0) AS clientErrorCount,
                        coalesce(sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END), 0) AS serverErrorCount
                    FROM access_event WHERE ${FILTER_SQL}`,
                )
                .get(...filterParameters(filter)),
        getPercentile: (filter: TrafficFilter, offset: number) =>
            database
                .query<{ requestTimeMs: number }, [number, number, number, string, string, number]>(
                    `SELECT request_time_ms AS requestTimeMs FROM access_event
                    WHERE ${FILTER_SQL} ORDER BY request_time_ms ASC LIMIT 1 OFFSET ?`,
                )
                .get(...filterParameters(filter), offset)?.requestTimeMs ?? 0,
        getRecentEvents: (filter: TrafficFilter, limit: number) =>
            database
                .query<
                    {
                        bytesSent: number
                        clientIp: string
                        country: string
                        host: string
                        method: string
                        occurredAt: number
                        requestId: string
                        requestTimeMs: number
                        status: number
                        uriPath: string
                    },
                    [number, number, number, string, string, number]
                >(
                    `SELECT
                        request_id AS requestId, occurred_at AS occurredAt, client_ip AS clientIp,
                        host, method, uri_path AS uriPath, status, request_time_ms AS requestTimeMs,
                        bytes_sent AS bytesSent, country
                    FROM access_event WHERE ${FILTER_SQL}
                    ORDER BY occurred_at DESC LIMIT ?`,
                )
                .all(...filterParameters(filter), limit),
        getExportEvents: (from: number, to: number) =>
            database
                .query<
                    {
                        bytesSent: number
                        clientIp: string
                        country: string
                        host: string
                        method: string
                        occurredAt: number
                        requestId: string
                        requestTimeMs: number
                        status: number
                        uriPath: string
                    },
                    [number, number]
                >(
                    `SELECT request_id AS requestId, occurred_at AS occurredAt, client_ip AS clientIp,
                        host, method, uri_path AS uriPath, status, request_time_ms AS requestTimeMs,
                        bytes_sent AS bytesSent, country
                    FROM access_event WHERE occurred_at >= ? AND occurred_at < ?
                    ORDER BY occurred_at ASC, request_id ASC`,
                )
                .all(from, to),
        getStatusCounts: (filter: TrafficFilter) =>
            database
                .query<{ count: number; status: number }, [number, number, number, string, string]>(
                    `SELECT status, count(*) AS count FROM access_event WHERE ${FILTER_SQL}
                    GROUP BY status ORDER BY count DESC, status ASC`,
                )
                .all(...filterParameters(filter)),
        getTopPaths: (filter: TrafficFilter) =>
            database
                .query<
                    { averageResponseTimeMs: number; errorCount: number; requestCount: number; uriPath: string },
                    [number, number, number, string, string]
                >(
                    `SELECT
                        uri_path AS uriPath, count(*) AS requestCount,
                        coalesce(avg(request_time_ms), 0) AS averageResponseTimeMs,
                        coalesce(sum(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS errorCount
                    FROM access_event WHERE ${FILTER_SQL}
                    GROUP BY uri_path ORDER BY requestCount DESC, uri_path ASC LIMIT 10`,
                )
                .all(...filterParameters(filter)),
        insertEvents: (events: NginxAccessEvent[]) => insertMany(events),
        restoreSnapshot: (filePath: string) => {
            const source = new Database(filePath, { strict: true })
            try {
                const integrity = source.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()?.integrity_check
                const columns = source
                    .query<{ name: string }, []>('PRAGMA table_info(access_event)')
                    .all()
                    .map((column) => column.name)
                if (integrity !== 'ok' || columns.join(',') !== ACCESS_EVENT_COLUMNS.join(',')) {
                    throw new Error('BACKUP_TRAFFIC_INVALID')
                }
            } finally {
                source.close()
            }

            const escapedPath = filePath.replaceAll("'", "''")
            database.exec(`ATTACH DATABASE '${escapedPath}' AS backup_source`)
            try {
                database.transaction(() => {
                    database.exec('DELETE FROM access_event')
                    database.exec(
                        `INSERT INTO access_event (${ACCESS_EVENT_COLUMNS.join(',')}) SELECT ${ACCESS_EVENT_COLUMNS.join(',')} FROM backup_source.access_event`,
                    )
                })()
            } finally {
                database.exec('DETACH DATABASE backup_source')
            }
        },
        serializeSnapshot: () => database.serialize(),
    }
}

export type TrafficDatabase = ReturnType<typeof createTrafficDatabase>
