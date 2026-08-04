import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { containerLogStreamQuerySchema } from '@containers/contracts/engine-stream'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { EngineAgentClient } from '../../service/shared/engine-agent-client/create-engine-agent-client'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const SESSION_RECHECK_INTERVAL_MS = 15_000
const MAX_CONCURRENT_PROXY_STREAMS = 32
const containerIdParamSchema = z.object({ containerId: z.string().min(1) })

const SSE_HEADERS = {
    'cache-control': 'no-store',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
} as const

type EngineStreamProxyRouteDependencies = {
    authService: Pick<AuthService, 'requireRole'>
    engineAgentClient: Pick<EngineAgentClient, 'openContainerLogStream' | 'openContainerStatsStream' | 'openEventStream'>
}

export const createEngineStreamProxyRoute = ({ authService, engineAgentClient }: EngineStreamProxyRouteDependencies) => {
    let activeStreams = 0

    const proxy = async (headers: Headers, open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>) => {
        const upstreamController = new AbortController()
        await authService.requireRole(headers, ALL_ROLES)
        if (activeStreams >= MAX_CONCURRENT_PROXY_STREAMS) {
            throw createAppError('STREAM_LIMIT_REACHED')
        }
        activeStreams += 1
        let released = false
        const release = () => {
            if (released) return
            released = true
            activeStreams -= 1
        }
        const upstream = await open(upstreamController.signal).catch((error: unknown) => {
            release()
            throw error
        })
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
                        release()
                        controller.close()
                        return
                    }
                    controller.enqueue(value)
                } catch {
                    clearInterval(recheck)
                    release()
                    controller.close()
                }
            },
            cancel: () => {
                clearInterval(recheck)
                release()
                upstreamController.abort()
            },
        })
        return new Response(body, { headers: SSE_HEADERS, status: 200 })
    }

    return new Hono()
        .get(
            '/stream/events',
            describeRoute({
                responses: { 200: { description: '실시간 이벤트 SSE' } },
                summary: '실시간 이벤트 스트림',
                tags: ['Stream'],
            }),
            withErrorHandling((context) => proxy(context.req.raw.headers, (signal) => engineAgentClient.openEventStream(signal))),
        )
        .get(
            '/stream/containers/:containerId/logs',
            describeRoute({
                responses: { 200: { description: '실시간 컨테이너 로그 SSE' } },
                summary: '실시간 컨테이너 로그 스트림',
                tags: ['Stream'],
            }),
            validator('param', containerIdParamSchema),
            validator('query', containerLogStreamQuerySchema),
            withErrorHandling((context) => {
                const containerId = (context.req.valid('param' as never) as z.infer<typeof containerIdParamSchema>).containerId
                const { tail } = context.req.valid('query' as never) as z.infer<typeof containerLogStreamQuerySchema>
                return proxy(context.req.raw.headers, (signal) => engineAgentClient.openContainerLogStream(containerId, tail, signal))
            }),
        )
        .get(
            '/stream/containers/:containerId/stats',
            describeRoute({
                responses: { 200: { description: '실시간 컨테이너 stats SSE' } },
                summary: '실시간 컨테이너 stats 스트림',
                tags: ['Stream'],
            }),
            validator('param', containerIdParamSchema),
            withErrorHandling((context) => {
                const containerId = (context.req.valid('param' as never) as z.infer<typeof containerIdParamSchema>).containerId
                return proxy(context.req.raw.headers, (signal) => engineAgentClient.openContainerStatsStream(containerId, signal))
            }),
        )
}
