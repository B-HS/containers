import { Hono } from 'hono'
import { z } from 'zod'
import { trafficAnalyticsQuerySchema, trafficLiveQuerySchema } from '@containers/contracts/traffic'
import type { TrafficIngestionService } from '../service/create-traffic-ingestion-service'
import type { TrafficQueryService } from '../service/create-traffic-query-service'
import type { TrafficExportService } from '../service/create-traffic-export-service'

const summaryQuerySchema = z.object({ windowMinutes: z.coerce.number().int().min(1).max(1_440).default(1) })

type TrafficRouteDependencies = {
    exportService: TrafficExportService
    ingestionService: Pick<TrafficIngestionService, 'getState' | 'subscribe'>
    queryService: TrafficQueryService
}

export const createTrafficRoute = ({ exportService, ingestionService, queryService }: TrafficRouteDependencies) =>
    new Hono()
        .get('/analytics', (context) => context.json(queryService.getAnalytics(trafficAnalyticsQuerySchema.parse(context.req.query())), 200))
        .get('/live', (context) => {
            const query = trafficLiveQuerySchema.parse(context.req.query())
            const encoder = new TextEncoder()
            let unsubscribe: (() => boolean) | undefined
            let heartbeat: ReturnType<typeof setInterval> | undefined
            try {
                const body = new ReadableStream<Uint8Array>({
                    cancel: () => {
                        clearInterval(heartbeat)
                        unsubscribe?.()
                    },
                    start: (controller) => {
                        unsubscribe = ingestionService.subscribe(query, (event) => {
                            if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                        })
                        heartbeat = setInterval(() => {
                            if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(': keepalive\n\n'))
                        }, 15_000)
                        context.req.raw.signal.addEventListener('abort', () => {
                            clearInterval(heartbeat)
                            unsubscribe?.()
                        })
                    },
                })
                return new Response(body, {
                    headers: { 'cache-control': 'no-store', 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' },
                })
            } catch (error) {
                if (error instanceof Error && error.message === 'TRAFFIC_STREAM_LIMIT') {
                    return context.json({ error: 'TRAFFIC_STREAM_LIMIT' }, 429)
                }
                throw error
            }
        })
        .get('/summary', (context) => {
            const query = summaryQuerySchema.parse(context.req.query())
            return context.json(queryService.getSummary(query.windowMinutes), 200)
        })
        .get('/ingestion', (context) => context.json(ingestionService.getState(), 200))
        .post('/exports/:jobId', async (context) =>
            context.json(await exportService.create(context.req.param('jobId'), await context.req.json()), 201),
        )
