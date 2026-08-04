import { z } from 'zod'

export const nginxAccessEventSchema = z.object({
    bytes_sent: z.number().int().nonnegative(),
    cf_ray: z.string(),
    client_ip: z.string().min(1),
    country: z.string(),
    host: z.string(),
    method: z.string().min(1),
    protocol: z.string(),
    request_id: z.string().min(1),
    request_length: z.number().int().nonnegative(),
    request_time: z.number().nonnegative(),
    schema_version: z.literal(1),
    scheme: z.string(),
    server_name: z.string(),
    status: z.number().int().min(100).max(599),
    timestamp: z.iso.datetime({ offset: true }),
    upstream_addr: z.string(),
    upstream_connect_time: z.string(),
    upstream_header_time: z.string(),
    upstream_response_time: z.string(),
    upstream_status: z.string(),
    uri_path: z.string().startsWith('/'),
    user_agent: z.string(),
})

export const trafficSummarySchema = z.object({
    averageResponseTimeMs: z.number().nonnegative(),
    bytesSent: z.number().int().nonnegative(),
    clientErrorCount: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    requestsPerSecond: z.number().nonnegative(),
    serverErrorCount: z.number().int().nonnegative(),
    windowMinutes: z.number().int().positive(),
})

export const trafficStatusClassSchema = z.enum(['all', '2xx', '3xx', '4xx', '5xx'])

export const trafficAnalyticsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    pathPrefix: z.string().startsWith('/').max(512).optional(),
    statusClass: trafficStatusClassSchema.default('all'),
    windowMinutes: z.coerce.number().int().min(1).max(1_440).default(60),
})

export const trafficLiveQuerySchema = z.object({
    pathPrefix: z.string().startsWith('/').max(512).optional(),
    statusClass: trafficStatusClassSchema.default('all'),
})

export const trafficSummaryQuerySchema = z.object({
    windowMinutes: z.coerce.number().int().min(1).max(1_440).default(1),
})

export const trafficExportJobParamSchema = z.object({
    jobId: z.uuid(),
})

export const trafficLiveEventSchema = z.object({
    bytesSent: z.number().int().nonnegative(),
    clientIpMasked: z.string().min(1),
    country: z.string(),
    host: z.string(),
    method: z.string(),
    occurredAt: z.iso.datetime(),
    requestId: z.string().min(1),
    responseTimeMs: z.number().nonnegative(),
    status: z.number().int().min(100).max(599),
    uriPath: z.string().startsWith('/'),
})

export const trafficExportResultSchema = z.object({
    bytes: z.number().int().nonnegative(),
    fileName: z.string().regex(/^traffic-[0-9a-f-]{36}\.(csv|ndjson)$/),
    format: z.enum(['csv', 'ndjson']),
    rowCount: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const trafficAnalyticsSchema = z.object({
    averageResponseTimeMs: z.number().nonnegative(),
    bytesSent: z.number().int().nonnegative(),
    clientErrorCount: z.number().int().nonnegative(),
    errorRate: z.number().min(0).max(1),
    events: z.array(trafficLiveEventSchema),
    latency: z.object({
        p50Ms: z.number().nonnegative(),
        p95Ms: z.number().nonnegative(),
        p99Ms: z.number().nonnegative(),
    }),
    requestCount: z.number().int().nonnegative(),
    requestsPerSecond: z.number().nonnegative(),
    serverErrorCount: z.number().int().nonnegative(),
    statusCounts: z.array(z.object({ count: z.number().int().nonnegative(), status: z.number().int().min(100).max(599) })),
    topPaths: z.array(
        z.object({
            averageResponseTimeMs: z.number().nonnegative(),
            errorCount: z.number().int().nonnegative(),
            requestCount: z.number().int().nonnegative(),
            uriPath: z.string().startsWith('/'),
        }),
    ),
    windowMinutes: z.number().int().positive(),
})

export type NginxAccessEvent = z.infer<typeof nginxAccessEventSchema>
export type TrafficAnalytics = z.infer<typeof trafficAnalyticsSchema>
export type TrafficAnalyticsQuery = z.infer<typeof trafficAnalyticsQuerySchema>
export type TrafficExportJobParam = z.infer<typeof trafficExportJobParamSchema>
export type TrafficLiveEvent = z.infer<typeof trafficLiveEventSchema>
export type TrafficLiveQuery = z.infer<typeof trafficLiveQuerySchema>
export type TrafficSummaryQuery = z.infer<typeof trafficSummaryQuerySchema>
