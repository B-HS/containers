import { describe, expect, test } from 'bun:test'
import { readTrustedProxies } from '@containers/nginx-config/trusted-proxy'
import { createTrustedProxyService, type TrustedProxyRecord } from './create-trusted-proxy-service'

const NOW = new Date('2026-08-05T00:00:00.000Z')

const CONFIG = `events {}
http {
    set_real_ip_from 10.89.0.10/32;
    real_ip_header CF-Connecting-IP;
}
`

const CANDIDATE = {
    address: '203.0.113.7',
    firstSeenAt: '2026-08-05T00:00:00+00:00',
    hosts: ['panel.example.com'],
    lastSeenAt: '2026-08-05T00:01:00+00:00',
    requestCount: 12,
}

const createFixture = (initial: TrustedProxyRecord[] = []) => {
    const applied: { config: string; expectedSha256: string }[] = []
    let records = initial
    let config = CONFIG

    const service = createTrustedProxyService({
        db: {
            list: () => records,
            remove: (address) => {
                records = records.filter((record) => record.address !== address)
            },
            save: ({ address, approvedAt, hostname, note }) => {
                records = [...records.filter((record) => record.address !== address), { address, approvedAt, hostname, note }]
            },
        },
        listCandidates: async (excluded) => [CANDIDATE].filter((candidate) => !excluded.includes(candidate.address)),
        nginxClient: {
            applyNginxConfig: async (input) => {
                applied.push(input)
                config = input.config
                return undefined
            },
            getNginxConfig: async () => ({ config, sha256: 'a'.repeat(64) }),
        },
        now: () => NOW,
        resolveHostname: async (address) => (address === CANDIDATE.address ? 'edge.example.net' : null),
    })

    return { applied, getConfig: () => config, getRecords: () => records, service }
}

describe('신뢰 프록시 서비스', () => {
    test('승인 전에는 후보로 보이고 역방향 DNS 가 붙는다', async () => {
        const { service } = createFixture()

        const state = await service.getState()

        expect(state.approved).toEqual([])
        expect(state.candidates).toHaveLength(1)
        expect(state.candidates[0]?.address).toBe(CANDIDATE.address)
        expect(state.candidates[0]?.hostname).toBe('edge.example.net')
        expect(state.candidates[0]?.requestCount).toBe(CANDIDATE.requestCount)
        expect(state.effectiveSources).toEqual(['10.89.0.10/32'])
    })

    test('승인하면 nginx 신뢰 목록에 들어가고 후보에서 빠진다', async () => {
        const { applied, getConfig, service } = createFixture()

        await service.approve('user-owner', { address: CANDIDATE.address, note: '터널' })

        expect(applied).toHaveLength(1)
        expect(readTrustedProxies(getConfig())).toEqual([`${CANDIDATE.address}/32`])

        const state = await service.getState()

        expect(state.candidates).toEqual([])
        expect(state.approved[0]?.address).toBe(CANDIDATE.address)
        expect(state.approved[0]?.hostname).toBe('edge.example.net')
        expect(state.approved[0]?.note).toBe('터널')
    })

    test('이미 nginx 가 신뢰하는 주소는 후보로 다시 뜨지 않는다', async () => {
        const { service } = createFixture()
        const excluded: string[] = []

        const scoped = createTrustedProxyService({
            db: { list: () => [], remove: () => undefined, save: () => undefined },
            listCandidates: async (addresses) => {
                excluded.push(...addresses)
                return []
            },
            nginxClient: { applyNginxConfig: async () => undefined, getNginxConfig: async () => ({ config: CONFIG, sha256: 'a'.repeat(64) }) },
            now: () => NOW,
            resolveHostname: async () => null,
        })

        await scoped.getState()

        expect(excluded).toContain('10.89.0.10')
        expect(await service.getState()).toBeDefined()
    })

    test('전체 대역이나 잘못된 주소는 거부한다', async () => {
        const { applied, service } = createFixture()

        await expect(service.approve('user-owner', { address: '0.0.0.0/0', note: null })).rejects.toThrow()
        await expect(service.approve('user-owner', { address: '10.0.0.0/8', note: null })).rejects.toThrow()
        await expect(service.approve('user-owner', { address: 'not-an-ip', note: null })).rejects.toThrow()
        expect(applied).toHaveLength(0)
    })

    test('IPv6 는 /128 로 적용한다', async () => {
        const { getConfig, service } = createFixture()

        await service.approve('user-owner', { address: '2001:db8::1', note: null })

        expect(readTrustedProxies(getConfig())).toEqual(['2001:db8::1/128'])
    })

    test('삭제하면 목록에서 빠지고 nginx 에 반영된다', async () => {
        const { getConfig, service } = createFixture()

        await service.approve('user-owner', { address: '203.0.113.7', note: null })
        await service.approve('user-owner', { address: '198.51.100.9', note: null })
        await service.revoke('203.0.113.7')

        expect(readTrustedProxies(getConfig())).toEqual(['198.51.100.9/32'])
    })

    test('마지막 한 개는 삭제할 수 없다', async () => {
        const { service } = createFixture()

        await service.approve('user-owner', { address: '203.0.113.7', note: null })

        await expect(service.revoke('203.0.113.7')).rejects.toThrow('TRUSTED_PROXY_LAST_ENTRY')
    })
})
