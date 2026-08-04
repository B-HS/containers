import { trafficAnalyticsQuerySchema, trafficAnalyticsSchema, trafficSummarySchema } from '@containers/contracts/traffic'
import type { TrafficQueryClient } from '../../db/create-query-worker'

type TrafficQueryServiceDependencies = {
    queryClient: Pick<
        TrafficQueryClient,
        'getAnalyticsSummary' | 'getPercentile' | 'getRecentEvents' | 'getStatusCounts' | 'getSummary' | 'getTopPaths'
    >
    now: () => number
}

const getStatusRange = (statusClass: 'all' | '2xx' | '3xx' | '4xx' | '5xx') => {
    if (statusClass === 'all') {
        return { statusMaximum: 599, statusMinimum: 100 }
    }

    const statusMinimum = Number(statusClass[0]) * 100
    return { statusMaximum: statusMinimum + 99, statusMinimum }
}

const maskClientIp = (clientIp: string) => {
    if (clientIp.includes('.')) {
        const parts = clientIp.split('.')
        return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : 'masked'
    }

    if (clientIp.includes(':')) {
        return `${clientIp
            .split(':')
            .filter((part) => part.length > 0)
            .slice(0, 4)
            .join(':')}::`
    }

    return 'masked'
}

const percentileOffset = (requestCount: number, percentile: number) => Math.max(0, Math.ceil(requestCount * percentile) - 1)

export const createTrafficQueryService = ({ now, queryClient }: TrafficQueryServiceDependencies) => ({
    getAnalytics: async (input: unknown) => {
        const query = trafficAnalyticsQuerySchema.parse(input)
        const filter = {
            pathPrefix: query.pathPrefix ?? '',
            since: now() - query.windowMinutes * 60_000,
            ...getStatusRange(query.statusClass),
        }
        const summary = await queryClient.getAnalyticsSummary(filter)
        const requestCount = summary?.requestCount ?? 0
        const errorCount = (summary?.clientErrorCount ?? 0) + (summary?.serverErrorCount ?? 0)
        const [events, p50Ms, p95Ms, p99Ms, statusCounts, topPaths] = await Promise.all([
            queryClient.getRecentEvents(filter, query.limit),
            requestCount === 0 ? 0 : queryClient.getPercentile(filter, percentileOffset(requestCount, 0.5)),
            requestCount === 0 ? 0 : queryClient.getPercentile(filter, percentileOffset(requestCount, 0.95)),
            requestCount === 0 ? 0 : queryClient.getPercentile(filter, percentileOffset(requestCount, 0.99)),
            queryClient.getStatusCounts(filter),
            queryClient.getTopPaths(filter),
        ])

        return trafficAnalyticsSchema.parse({
            averageResponseTimeMs: summary?.averageResponseTimeMs ?? 0,
            bytesSent: summary?.bytesSent ?? 0,
            clientErrorCount: summary?.clientErrorCount ?? 0,
            errorRate: requestCount === 0 ? 0 : errorCount / requestCount,
            events: events.map((event) => ({
                bytesSent: event.bytesSent,
                clientIpMasked: maskClientIp(event.clientIp),
                country: event.country,
                host: event.host,
                method: event.method,
                occurredAt: new Date(event.occurredAt).toISOString(),
                requestId: event.requestId,
                responseTimeMs: event.requestTimeMs,
                status: event.status,
                uriPath: event.uriPath,
            })),
            latency: { p50Ms, p95Ms, p99Ms },
            requestCount,
            requestsPerSecond: requestCount / (query.windowMinutes * 60),
            serverErrorCount: summary?.serverErrorCount ?? 0,
            statusCounts,
            topPaths,
            windowMinutes: query.windowMinutes,
        })
    },
    getSummary: async (windowMinutes: number) => {
        const summary = await queryClient.getSummary(now() - windowMinutes * 60_000)
        const requestCount = summary?.requestCount ?? 0

        return trafficSummarySchema.parse({
            averageResponseTimeMs: summary?.averageResponseTimeMs ?? 0,
            bytesSent: summary?.bytesSent ?? 0,
            clientErrorCount: summary?.clientErrorCount ?? 0,
            requestCount,
            requestsPerSecond: requestCount / (windowMinutes * 60),
            serverErrorCount: summary?.serverErrorCount ?? 0,
            windowMinutes,
        })
    },
})

export type TrafficQueryService = ReturnType<typeof createTrafficQueryService>
