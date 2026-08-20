import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { MAX_CONCURRENT_ENGINE_STREAMS } from '@containers/contracts/engine-stream'
import { createAppError } from '../../lib/error'
import { createEngineStreamProxyRoute } from './create-engine-stream-proxy-route'

const MAX_CONCURRENT_PROXY_STREAMS = MAX_CONCURRENT_ENGINE_STREAMS
const REQUEST_ID = 'req-stream'

const createIdleStream = () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start: () => undefined })

const createApp = (openEventStream: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array<ArrayBuffer>>>) => {
    const route = createEngineStreamProxyRoute({
        apiKeyService: {
            authenticate: async () => ({ actorId: 'user-api', apiKeyId: 'api-key-id', authMethod: 'api-key' as const, role: 'owner' }),
        },
        authService: {
            requireRecentRole: async () => ({ role: 'owner', user: { id: 'user-stream' } }) as never,
            requireRole: async () => ({ role: 'owner', user: { id: 'user-stream' } }) as never,
        },
        engineAgentClient: {
            openContainerLogStream: async () => createIdleStream(),
            openContainerStatsStream: async () => createIdleStream(),
            openEventStream,
        },
    })

    return new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route('/', route)
}

const expectEverySlotFree = async (app: ReturnType<typeof createApp>) => {
    const held = await Promise.all(Array.from({ length: MAX_CONCURRENT_PROXY_STREAMS }, () => app.request('/stream/events')))

    expect(held.map((response) => response.status)).toEqual(Array.from({ length: MAX_CONCURRENT_PROXY_STREAMS }, () => 200))
    expect((await app.request('/stream/events')).status).toBe(429)
    await Promise.all(held.map((response) => response.body?.cancel()))
    await Bun.sleep(1)
}

describe('createEngineStreamProxyRoute', () => {
    test('상한에 도달하면 429 를 반환하고, 스트림을 닫으면 슬롯이 전부 반환된다', async () => {
        const app = createApp(async () => createIdleStream())

        await expectEverySlotFree(app)
        await expectEverySlotFree(app)
    })

    test('업스트림 연결을 기다리는 동안 클라이언트가 끊어도 슬롯이 새지 않는다', async () => {
        let resolveUpstream: ((stream: ReadableStream<Uint8Array<ArrayBuffer>>) => void) | undefined
        const app = createApp(async () => {
            if (resolveUpstream) return createIdleStream()
            return new Promise<ReadableStream<Uint8Array<ArrayBuffer>>>((resolve) => {
                resolveUpstream = resolve
            })
        })

        const controller = new AbortController()
        const pending = Promise.resolve(app.request('/stream/events', { signal: controller.signal })).catch(() => undefined)
        while (!resolveUpstream) await Bun.sleep(1)
        controller.abort()
        resolveUpstream(createIdleStream())
        await pending
        await Bun.sleep(1)

        await expectEverySlotFree(app)
    })

    test('업스트림 연결이 실패해도 슬롯이 새지 않는다', async () => {
        let shouldFail = true
        const app = createApp(async () => {
            if (shouldFail) throw createAppError('ENGINE_UNAVAILABLE')
            return createIdleStream()
        })

        for (let attempt = 0; attempt < MAX_CONCURRENT_PROXY_STREAMS + 1; attempt += 1) {
            expect((await app.request('/stream/events')).status).toBe(503)
        }

        shouldFail = false
        await expectEverySlotFree(app)
    })

    test('업스트림이 먼저 종료되면 슬롯이 반환된다', async () => {
        const app = createApp(async () => new ReadableStream<Uint8Array<ArrayBuffer>>({ start: (controller) => controller.close() }))

        for (let attempt = 0; attempt < MAX_CONCURRENT_PROXY_STREAMS + 4; attempt += 1) {
            const response = await app.request('/stream/events')
            expect(response.status).toBe(200)
            await response.text()
        }
    })
})
