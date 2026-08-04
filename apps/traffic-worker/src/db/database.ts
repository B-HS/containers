import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { count, desc, lt, sql } from 'drizzle-orm'
import type { NginxAccessEvent } from '@containers/contracts/traffic'
import { createAppError } from '@/lib/error'
import { accessEvent, schema } from './schema'

type TrafficDatabaseDependencies = {
    filePath: string
    migrationsFolder: string
}

type TrafficFilter = {
    pathPrefix: string
    since: number
    statusMaximum: number
    statusMinimum: number
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
    'raw_json',
] as const

const filterCondition = (filter: TrafficFilter) =>
    sql`${accessEvent.occurredAt} >= ${filter.since} AND ${accessEvent.status} BETWEEN ${filter.statusMinimum} AND ${filter.statusMaximum} AND (${filter.pathPrefix} = '' OR instr(${accessEvent.uriPath}, ${filter.pathPrefix}) = 1)`

const summaryColumns = {
    averageResponseTimeMs: sql<number>`coalesce(avg(${accessEvent.requestTimeMs}), 0)`,
    bytesSent: sql<number>`coalesce(sum(${accessEvent.bytesSent}), 0)`,
    clientErrorCount: sql<number>`coalesce(sum(case when ${accessEvent.status} between 400 and 499 then 1 else 0 end), 0)`,
    requestCount: count(),
    serverErrorCount: sql<number>`coalesce(sum(case when ${accessEvent.status} >= 500 then 1 else 0 end), 0)`,
}

export const createTrafficDatabase = ({ filePath, migrationsFolder }: TrafficDatabaseDependencies) => {
    const sqlite = new Database(filePath, { create: true, strict: true })

    sqlite.exec('PRAGMA journal_mode = WAL')
    sqlite.exec('PRAGMA busy_timeout = 5000')

    const db = drizzle({ client: sqlite, schema })
    migrate(db, { migrationsFolder })

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
                        rawJson: JSON.stringify(event),
                    })),
                )
                .onConflictDoNothing()
                .returning({ requestId: accessEvent.requestId })
                .all()
                .map((row) => row.requestId),
        )
    }

    return {
        close: () => sqlite.close(),
        deleteBefore: (timestamp: number) => db.delete(accessEvent).where(lt(accessEvent.occurredAt, timestamp)).run(),
        getSummary: (since: number) =>
            db
                .select(summaryColumns)
                .from(accessEvent)
                .where(sql`${accessEvent.occurredAt} >= ${since}`)
                .get(),
        getAnalyticsSummary: (filter: TrafficFilter) => db.select(summaryColumns).from(accessEvent).where(filterCondition(filter)).get(),
        getPercentile: (filter: TrafficFilter, offset: number) =>
            db
                .select({ requestTimeMs: accessEvent.requestTimeMs })
                .from(accessEvent)
                .where(filterCondition(filter))
                .orderBy(accessEvent.requestTimeMs)
                .limit(1)
                .offset(offset)
                .get()?.requestTimeMs ?? 0,
        getRecentEvents: (filter: TrafficFilter, limit: number) =>
            db
                .select({
                    requestId: accessEvent.requestId,
                    occurredAt: accessEvent.occurredAt,
                    clientIp: accessEvent.clientIp,
                    host: accessEvent.host,
                    method: accessEvent.method,
                    uriPath: accessEvent.uriPath,
                    status: accessEvent.status,
                    requestTimeMs: accessEvent.requestTimeMs,
                    bytesSent: accessEvent.bytesSent,
                    country: accessEvent.country,
                })
                .from(accessEvent)
                .where(filterCondition(filter))
                .orderBy(desc(accessEvent.occurredAt))
                .limit(limit)
                .all(),
        getExportEvents: (from: number, to: number) =>
            db
                .select({
                    requestId: accessEvent.requestId,
                    occurredAt: accessEvent.occurredAt,
                    clientIp: accessEvent.clientIp,
                    host: accessEvent.host,
                    method: accessEvent.method,
                    uriPath: accessEvent.uriPath,
                    status: accessEvent.status,
                    requestTimeMs: accessEvent.requestTimeMs,
                    bytesSent: accessEvent.bytesSent,
                    country: accessEvent.country,
                })
                .from(accessEvent)
                .where(sql`${accessEvent.occurredAt} >= ${from} AND ${accessEvent.occurredAt} < ${to}`)
                .orderBy(accessEvent.occurredAt, accessEvent.requestId)
                .all(),
        getStatusCounts: (filter: TrafficFilter) =>
            db
                .select({ status: accessEvent.status, count: count() })
                .from(accessEvent)
                .where(filterCondition(filter))
                .groupBy(accessEvent.status)
                .orderBy(desc(sql`count(*)`), accessEvent.status)
                .all(),
        getTopPaths: (filter: TrafficFilter) =>
            db
                .select({
                    uriPath: accessEvent.uriPath,
                    requestCount: count(),
                    averageResponseTimeMs: sql<number>`coalesce(avg(${accessEvent.requestTimeMs}), 0)`,
                    errorCount: sql<number>`coalesce(sum(case when ${accessEvent.status} >= 400 then 1 else 0 end), 0)`,
                })
                .from(accessEvent)
                .where(filterCondition(filter))
                .groupBy(accessEvent.uriPath)
                .orderBy(desc(sql`count(*)`), accessEvent.uriPath)
                .limit(10)
                .all(),
        insertEvents,
        restoreSnapshot: (filePath: string) => {
            const source = new Database(filePath, { strict: true })
            try {
                const integrity = source.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()?.integrity_check
                const columns = source
                    .query<{ name: string }, []>('PRAGMA table_info(access_event)')
                    .all()
                    .map((column) => column.name)
                if (integrity !== 'ok' || columns.join(',') !== ACCESS_EVENT_COLUMNS.join(',')) {
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
