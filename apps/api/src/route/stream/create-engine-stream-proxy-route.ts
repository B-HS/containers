import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { containerLogStreamQuerySchema, MAX_CONCURRENT_ENGINE_STREAMS, SSE_STREAM_OPEN_COMMENT } from '@containers/contracts/engine-stream'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { authenticateScopeOrRole } from '../../lib/authenticate-scope-or-role'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { EngineAgentClient } from '../../service/shared/engine-agent-client/create-engine-agent-client'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const SESSION_RECHECK_INTERVAL_MS = 15_000
const containerIdParamSchema = z.object({ containerId: z.string().min(1) })

const SSE_HEADERS = {
    'cache-control': 'no-store',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
} as const

type EngineStreamProxyRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    engineAgentClient: Pick<EngineAgentClient, 'openContainerLogStream' | 'openContainerStatsStream' | 'openEventStream'>
}

export const createEngineStreamProxyRoute = ({ apiKeyService, authService, engineAgentClient }: EngineStreamProxyRouteDependencies) => {
    const authenticateStream = (headers: Headers) =>
        authenticateScopeOrRole({ apiKeyService, authService, headers, roles: ALL_ROLES, scope: API_KEY_SCOPE.ENGINE_READ })
    let activeStreams = 0

    const proxy = async (request: Request, open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>) => {
        const headers = request.headers
        await authenticateStream(headers)
        if (activeStreams >= MAX_CONCURRENT_ENGINE_STREAMS) {
            throw createAppError('STREAM_LIMIT_REACHED')
        }

        const upstreamController = new AbortController()
        let recheck: ReturnType<typeof setInterval> | undefined
        let released = false
        activeStreams += 1

        const release = () => {
            if (released) return
            released = true
            activeStreams -= 1
            clearInterval(recheck)
            request.signal.removeEventListener('abort', release)
            upstreamController.abort()
        }

        request.signal.addEventListener('abort', release)
        if (request.signal.aborted) {
            release()
            throw createAppError('STREAM_CLIENT_ABORTED')
        }

        const upstream = await open(upstreamController.signal).catch((error: unknown) => {
            release()
            throw error
        })

        if (released) {
            await upstream.cancel().catch(() => undefined)
            throw createAppError('STREAM_CLIENT_ABORTED')
        }

        const reader = upstream.getReader()
        const body = new ReadableStream<Uint8Array>({
            start: (controller) => {
                controller.enqueue(new TextEncoder().encode(SSE_STREAM_OPEN_COMMENT))
                recheck = setInterval(() => {
                    authenticateStream(headers).catch(() => upstreamController.abort())
                }, SESSION_RECHECK_INTERVAL_MS)
            },
            pull: async (controller) => {
                try {
                    const { done, value } = await reader.read()
                    if (done) {
                        release()
                        controller.close()
                        return
                    }
                    controller.enqueue(value)
                } catch {
                    release()
                    controller.close()
                }
            },
            cancel: () => release(),
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
            withErrorHandling((context) => proxy(context.req.raw, (signal) => engineAgentClient.openEventStream(signal))),
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
            withErrorHandling(
                (
                    context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema>; query: z.infer<typeof containerLogStreamQuerySchema> }>,
                ) => {
                    const containerId = context.req.valid('param').containerId
                    const { tail } = context.req.valid('query')
                    return proxy(context.req.raw, (signal) => engineAgentClient.openContainerLogStream(containerId, tail, signal))
                },
            ),
        )
        .get(
            '/stream/containers/:containerId/stats',
            describeRoute({
                responses: { 200: { description: '실시간 컨테이너 stats SSE' } },
                summary: '실시간 컨테이너 stats 스트림',
                tags: ['Stream'],
            }),
            validator('param', containerIdParamSchema),
            withErrorHandling((context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema> }>) => {
                const containerId = context.req.valid('param').containerId
                return proxy(context.req.raw, (signal) => engineAgentClient.openContainerStatsStream(containerId, signal))
            }),
        )
}
