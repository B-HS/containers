import { describe, expect, test } from 'bun:test'
import { createAppError } from '../../lib/error'
import { createEgressService } from './create-egress-service'

describe('egressService.resolve', () => {
    test('공인 주소로 해석되면 blocked=false 로 반환한다', async () => {
        const service = createEgressService({ resolveHost: async () => ['93.184.216.34'] })
        await expect(service.resolve({ hostname: 'discord.com' })).resolves.toEqual({
            addresses: ['93.184.216.34'],
            blocked: false,
            hostname: 'discord.com',
        })
    })

    test('사설 주소가 섞이면 blocked=true 다', async () => {
        const service = createEgressService({ resolveHost: async () => ['93.184.216.34', '192.168.0.10'] })
        await expect(service.resolve({ hostname: 'evil.example.com' })).resolves.toMatchObject({ blocked: true })
    })

    test('해석 실패나 빈 결과도 blocked=true 다', async () => {
        const failing = createEgressService({
            resolveHost: async () => {
                throw createAppError('UNKNOWN_ERROR')
            },
        })
        await expect(failing.resolve({ hostname: 'nx.example.com' })).resolves.toMatchObject({ addresses: [], blocked: true })
    })
})

describe('egressService.deliverWebhook', () => {
    const request = { body: '{"embeds":[]}', timeoutMs: 5_000, url: 'https://discord.com/api/webhooks/1/x' }

    test('차단 대상이면 EGRESS_TARGET_BLOCKED 를 던진다', async () => {
        const service = createEgressService({ resolveHost: async () => ['10.0.0.1'] })
        await expect(service.deliverWebhook(request)).rejects.toMatchObject({ code: 'EGRESS_TARGET_BLOCKED' })
    })

    test('http URL 은 스키마에서 거부된다', async () => {
        const service = createEgressService({ resolveHost: async () => ['93.184.216.34'] })
        await expect(service.deliverWebhook({ ...request, url: 'http://discord.com/api/webhooks/1/x' })).rejects.toThrow()
    })

    test('응답 상태와 retry-after 를 그대로 돌려준다', async () => {
        const service = createEgressService({
            fetcher: async () => new Response('rate limited', { headers: { 'retry-after': '17' }, status: 429 }),
            resolveHost: async () => ['93.184.216.34'],
        })
        await expect(service.deliverWebhook(request)).resolves.toEqual({ retryAfterSeconds: 17, status: 429 })
    })

    test('retry-after 가 없으면 null 이다', async () => {
        const service = createEgressService({
            fetcher: async () => new Response('ok', { status: 204 }),
            resolveHost: async () => ['93.184.216.34'],
        })
        await expect(service.deliverWebhook(request)).resolves.toEqual({ retryAfterSeconds: null, status: 204 })
    })

    test('네트워크 실패는 EGRESS_DELIVERY_FAILED 로 변환한다', async () => {
        const service = createEgressService({
            fetcher: async () => {
                throw createAppError('UNKNOWN_ERROR')
            },
            resolveHost: async () => ['93.184.216.34'],
        })
        await expect(service.deliverWebhook(request)).rejects.toMatchObject({ code: 'EGRESS_DELIVERY_FAILED' })
    })
})
