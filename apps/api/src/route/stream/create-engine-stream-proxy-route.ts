import { Hono, type Context } from 'hono'
import { containerLogStreamQuerySchema } from '@containers/contracts/engine-stream'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse } from '../../lib/response'
import type { EngineAgentClient } from '../../agent/create-engine-agent-client'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const SESSION_RECHECK_INTERVAL_MS = 15_000

const SSE_HEADERS = {
    'cache-control': 'no-store',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
} as const

type EngineStreamProxyRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    engineAgentClient: Pick<EngineAgentClient, 'openContainerLogStream' | 'openContainerStatsStream' | 'openEventStream'>
}

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'ENGINE_STREAM_LIMIT') return 429 as const
    return 503 as const
}

export const createEngineStreamProxyRoute = ({ authService, engineAgentClient }: EngineStreamProxyRouteDependencies) => {
    const proxy = async (context: Context, open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>) => {
        const headers = context.req.raw.headers
        const upstreamController = new AbortController()
        try {
            await authService.requireRole(headers, ALL_ROLES)
            const upstream = await open(upstreamController.signal)
            const reader = upstream.getReader()
            let recheck: ReturnType<typeof setInterval> | undefined
            const body = new ReadableStream<Uint8Array>({
                start: () => {
                    recheck = setInterval(() => {
                        authService.requireRole(headers, ALL_ROLES).catch(() => upstreamController.abort())
                    }, SESSION_RECHECK_INTERVAL_MS)
                },
                pull: async (controller) => {
                    try {
                        const { done, value } = await reader.read()
                        if (done) {
                            clearInterval(recheck)
                            controller.close()
                            return
                        }
                        controller.enqueue(value)
                    } catch {
                        clearInterval(recheck)
                        controller.close()
                    }
                },
                cancel: () => {
                    clearInterval(recheck)
                    upstreamController.abort()
                },
            })
            return new Response(body, { headers: SSE_HEADERS, status: 200 })
        } catch (error) {
            upstreamController.abort()
            const code = error instanceof Error ? error.message : 'ENGINE_STREAM_FAILED'
            return context.json(errorResponse(code, '실시간 stream 을 열 수 없습니다.', context.get('requestId')), errorStatus(code))
        }
    }

    return new Hono()
        .get('/stream/events', (context) => proxy(context, (signal) => engineAgentClient.openEventStream(signal)))
        .get('/stream/containers/:containerId/logs', (context) => {
            const query = containerLogStreamQuerySchema.parse(context.req.query())
            return proxy(context, (signal) => engineAgentClient.openContainerLogStream(context.req.param('containerId'), query.tail, signal))
        })
        .get('/stream/containers/:containerId/stats', (context) =>
            proxy(context, (signal) => engineAgentClient.openContainerStatsStream(context.req.param('containerId'), signal)),
        )
}
