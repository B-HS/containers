import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { count, desc, sql } from 'drizzle-orm'
import { accessEvent, schema } from './schema'

export type TrafficFilter = {
    pathPrefix: string
    since: number
    statusMaximum: number
    statusMinimum: number
}

export type TrafficExportCursor = {
    occurredAt: number
    requestId: string
}

const EXPORT_COLUMNS = {
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
}

const filterCondition = (filter: TrafficFilter) =>
    sql`${accessEvent.occurredAt} >= ${filter.since} AND ${accessEvent.status} BETWEEN ${filter.statusMinimum} AND ${filter.statusMaximum} AND (${filter.pathPrefix} = '' OR instr(${accessEvent.uriPath}, ${filter.pathPrefix}) = 1)`

const summaryColumns = {
    averageResponseTimeMs: sql<number>`coalesce(avg(${accessEvent.requestTimeMs}), 0)`,
    bytesSent: sql<number>`coalesce(sum(${accessEvent.bytesSent}), 0)`,
    clientErrorCount: sql<number>`coalesce(sum(case when ${accessEvent.status} between 400 and 499 then 1 else 0 end), 0)`,
    requestCount: count(),
    serverErrorCount: sql<number>`coalesce(sum(case when ${accessEvent.status} >= 500 then 1 else 0 end), 0)`,
}

export const createTrafficReadQueries = (sqlite: Database) => {
    const db = drizzle({ client: sqlite, schema })

    return {
        getAnalyticsSummary: (filter: TrafficFilter) => db.select(summaryColumns).from(accessEvent).where(filterCondition(filter)).get(),
        getExportEvents: (cursor: TrafficExportCursor, to: number, limit: number) =>
            db
                .select(EXPORT_COLUMNS)
                .from(accessEvent)
                .where(
                    sql`${accessEvent.occurredAt} < ${to} AND (${accessEvent.occurredAt}, ${accessEvent.requestId}) > (${cursor.occurredAt}, ${cursor.requestId})`,
                )
                .orderBy(accessEvent.occurredAt, accessEvent.requestId)
                .limit(limit)
                .all(),
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
            db.select(EXPORT_COLUMNS).from(accessEvent).where(filterCondition(filter)).orderBy(desc(accessEvent.occurredAt)).limit(limit).all(),
        getRowCount: () => db.select({ value: count() }).from(accessEvent).get()?.value ?? 0,
        getStatusCounts: (filter: TrafficFilter) =>
            db
                .select({ status: accessEvent.status, count: count() })
                .from(accessEvent)
                .where(filterCondition(filter))
                .groupBy(accessEvent.status)
                .orderBy(desc(sql`count(*)`), accessEvent.status)
                .all(),
        getSummary: (since: number) =>
            db
                .select(summaryColumns)
                .from(accessEvent)
                .where(sql`${accessEvent.occurredAt} >= ${since}`)
                .get(),
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
    }
}

export type TrafficReadQueries = ReturnType<typeof createTrafficReadQueries>
