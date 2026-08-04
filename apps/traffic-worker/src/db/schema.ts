import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accessEvent = sqliteTable(
    'access_event',
    {
        requestId: text('request_id').primaryKey(),
        occurredAt: integer('occurred_at').notNull(),
        clientIp: text('client_ip').notNull(),
        host: text('host').notNull(),
        method: text('method').notNull(),
        uriPath: text('uri_path').notNull(),
        status: integer('status').notNull(),
        requestTimeMs: real('request_time_ms').notNull(),
        bytesSent: integer('bytes_sent').notNull(),
        country: text('country').notNull(),
        userAgent: text('user_agent').notNull(),
    },
    (table) => [index('access_event_occurred_at_idx').on(table.occurredAt), index('access_event_status_idx').on(table.status)],
)

export const schema = {
    accessEvent,
}
