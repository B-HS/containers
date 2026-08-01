import { Hono } from 'hono'
import { containerLogStreamQuerySchema } from '@containers/contracts/engine-stream'
import type { EngineStreamService } from '../service/create-engine-stream-service'

type EngineStreamRouteDependencies = {
    engineStreamService: EngineStreamService
}

const SSE_HEADERS = {
    'cache-control': 'no-store',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
} as const

const streamErrorStatus = (code: string) => (code === 'ENGINE_STREAM_LIMIT' ? (429 as const) : (400 as const))

export const createEngineStreamRoute = ({ engineStreamService }: EngineStreamRouteDependencies) => {
    const respond = async (open: () => Promise<ReadableStream<Uint8Array>>) => {
        try {
            return new Response(await open(), { headers: SSE_HEADERS, status: 200 })
        } catch (error) {
            const code = error instanceof Error ? error.message : 'ENGINE_STREAM_FAILED'
            return Response.json({ error: code }, { status: streamErrorStatus(code) })
        }
    }

    return new Hono()
        .get('/streams/events', () => respond(() => engineStreamService.openEventStream()))
        .get('/streams/containers/:containerId/logs', (context) => {
            const query = containerLogStreamQuerySchema.parse(context.req.query())
            return respond(() => engineStreamService.openContainerLogStream(context.req.param('containerId'), query.tail))
        })
        .get('/streams/containers/:containerId/stats', (context) =>
            respond(() => engineStreamService.openContainerStatsStream(context.req.param('containerId'))),
        )
}
