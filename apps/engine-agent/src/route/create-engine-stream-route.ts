import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { containerLogStreamQuerySchema } from '@containers/contracts/engine-stream'
import type { EngineStreamService } from '../service/domain/create-engine-stream-service'
import { withErrorHandling, type AgentRouteContext } from '../lib/with-error-handling'

type EngineStreamRouteDependencies = {
    engineStreamService: EngineStreamService
}

const SSE_HEADERS = {
    'cache-control': 'no-store',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
} as const

const containerIdParamSchema = z.object({ containerId: z.string().min(1).max(256) })

export const createEngineStreamRoute = ({ engineStreamService }: EngineStreamRouteDependencies) => {
    const route = new Hono()

    const streamResponse = (open: () => Promise<ReadableStream<Uint8Array>>) =>
        withErrorHandling(async () => new Response(await open(), { headers: SSE_HEADERS, status: 200 }))

    route.get(
        '/streams/events',
        describeRoute({ tags: ['engine-stream'], summary: 'Docker 이벤트 실시간 stream', responses: { 200: { description: 'SSE stream' } } }),
        streamResponse(() => engineStreamService.openEventStream()),
    )
    route.get(
        '/streams/containers/:containerId/logs',
        describeRoute({ tags: ['engine-stream'], summary: '컨테이너 로그 실시간 stream', responses: { 200: { description: 'SSE stream' } } }),
        validator('param', containerIdParamSchema),
        validator('query', containerLogStreamQuerySchema),
        withErrorHandling(
            async (
                context: AgentRouteContext<{ param: z.infer<typeof containerIdParamSchema>; query: z.infer<typeof containerLogStreamQuerySchema> }>,
            ) => {
                const param = context.req.valid('param')
                const query = context.req.valid('query')
                return new Response(await engineStreamService.openContainerLogStream(param.containerId, query.tail), {
                    headers: SSE_HEADERS,
                    status: 200,
                })
            },
        ),
    )
    route.get(
        '/streams/containers/:containerId/stats',
        describeRoute({ tags: ['engine-stream'], summary: '컨테이너 stats 실시간 stream', responses: { 200: { description: 'SSE stream' } } }),
        validator('param', containerIdParamSchema),
        withErrorHandling(async (context: AgentRouteContext<{ param: z.infer<typeof containerIdParamSchema> }>) => {
            const param = context.req.valid('param')
            return new Response(await engineStreamService.openContainerStatsStream(param.containerId), {
                headers: SSE_HEADERS,
                status: 200,
            })
        }),
    )

    return route
}
