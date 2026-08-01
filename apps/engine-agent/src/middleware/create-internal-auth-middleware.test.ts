import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { createInternalRequestSignature, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'
import { createInternalAuthMiddleware } from './create-internal-auth-middleware'

const sharedSecret = 'test-secret-that-is-at-least-thirty-two-characters-long'
const now = 1_785_456_000_000

const createSignedRequest = (nonce: string, timestamp = now.toString()) => {
    const path = '/v1/protected'
    const signature = createInternalRequestSignature({ body: '', method: 'GET', nonce, path, secret: sharedSecret, timestamp })

    return new Request(`http://localhost${path}`, {
        headers: {
            [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
            [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
            [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
        },
    })
}

describe('Agent 내부 인증', () => {
    test('서명된 요청만 허용하고 nonce 재사용을 거부합니다', async () => {
        const app = new Hono()
            .use('/v1/*', createInternalAuthMiddleware({ now: () => now, secret: sharedSecret }))
            .get('/v1/protected', (context) => context.json({ ok: true }))
        const nonce = randomUUID()

        expect((await app.request(createSignedRequest(nonce))).status).toBe(200)
        expect((await app.request(createSignedRequest(nonce))).status).toBe(401)
        expect((await app.request('/v1/protected')).status).toBe(401)
    })

    test('허용 시각 범위를 벗어난 요청을 거부합니다', async () => {
        const app = new Hono()
            .use('/v1/*', createInternalAuthMiddleware({ now: () => now, secret: sharedSecret }))
            .get('/v1/protected', (context) => context.json({ ok: true }))

        expect((await app.request(createSignedRequest(randomUUID(), (now - 31_000).toString()))).status).toBe(401)
    })
})
