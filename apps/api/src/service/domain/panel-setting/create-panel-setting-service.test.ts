import { describe, expect, test } from 'bun:test'
import { readPanelServerNames } from '@containers/nginx-config/panel-hostname'
import { createPanelSettingService, type PanelSettingRecord } from './create-panel-setting-service'

const BOOT_ORIGIN = 'http://127.0.0.1:18080'
const NOW = new Date('2026-08-05T00:00:00.000Z')

const CONFIG = `events {}
http {
    server {
        listen 8080 default_server;
        server_name _;
        return 444;
    }

    server {
        listen 8080;
        server_name panel.containers.local localhost 127.0.0.1;
    }
}
`

const createFixture = (initial: PanelSettingRecord | null = null) => {
    const applied: { config: string; expectedSha256: string }[] = []
    let stored = initial
    let config = CONFIG

    const service = createPanelSettingService({
        bootOrigin: BOOT_ORIGIN,
        db: {
            load: () => stored,
            save: ({ extraTrustedOrigins, nginxHostname, publicOrigin, updatedAt }) => {
                stored = { extraTrustedOrigins, nginxHostname, publicOrigin, updatedAt }
            },
        },
        environmentTrustedOrigins: [BOOT_ORIGIN, 'http://localhost:18080'],
        listHostnameCandidates: async (excluded) =>
            [
                {
                    firstSeenAt: '2026-08-05T00:00:00+00:00',
                    hostname: 'new.example.com',
                    lastSeenAt: '2026-08-05T00:01:00+00:00',
                    rejectedCount: 3,
                    requestCount: 4,
                },
            ].filter((candidate) => !excluded.includes(candidate.hostname)),
        nginxClient: {
            applyNginxConfig: async (input) => {
                applied.push(input)
                config = input.config
                return undefined
            },
            getNginxConfig: async () => ({ config, sha256: 'a'.repeat(64) }),
        },
        now: () => NOW,
    })

    return { applied, getConfig: () => config, getStored: () => stored, service }
}

describe('패널 설정 서비스', () => {
    test('저장값이 없으면 환경변수 origin 만 신뢰한다', async () => {
        const { service } = createFixture()

        expect(service.getTrustedOrigins()).toEqual([BOOT_ORIGIN, 'http://localhost:18080'])
        expect((await service.get()).publicOrigin).toBeNull()
        expect((await service.get()).restartRequired).toBe(false)
    })

    test('access log 에서 관찰된 미등록 host 를 후보로 보여준다', async () => {
        const { service } = createFixture()

        const setting = await service.get()

        expect(setting.hostnameCandidates.map((candidate) => candidate.hostname)).toEqual(['new.example.com'])
        expect(setting.hostnameCandidates[0]?.rejectedCount).toBe(3)
    })

    test('이미 server_name 에 있는 host 는 후보에서 빠진다', async () => {
        const { service } = createFixture()

        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://new.example.com' })
        const setting = await service.get()

        expect(setting.hostnameCandidates).toEqual([])
    })

    test('공개 주소를 저장하면 신뢰 origin 에 더해지고 nginx server_name 이 갱신된다', async () => {
        const { applied, getConfig, service } = createFixture()

        const setting = await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://panel.example.com' })

        expect(setting.publicOrigin).toBe('https://panel.example.com')
        expect(setting.nginxHostname).toBe('panel.example.com')
        expect(service.getTrustedOrigins()).toEqual([BOOT_ORIGIN, 'http://localhost:18080', 'https://panel.example.com'])
        expect(applied).toHaveLength(1)
        expect(readPanelServerNames(getConfig())).toEqual(['panel.containers.local', 'localhost', '127.0.0.1', 'panel.example.com'])
    })

    test('환경변수 origin 은 어떤 저장값으로도 지워지지 않는다', async () => {
        const { service } = createFixture()

        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://panel.example.com' })

        expect(service.getTrustedOrigins()).toContain(BOOT_ORIGIN)
        expect(service.getTrustedOrigins()).toContain('http://localhost:18080')
    })

    test('공개 주소를 바꾸면 이전 hostname 을 server_name 에서 제거한다', async () => {
        const { getConfig, service } = createFixture()

        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://old.example.com' })
        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://new.example.com' })

        expect(readPanelServerNames(getConfig())).toEqual(['panel.containers.local', 'localhost', '127.0.0.1', 'new.example.com'])
        expect(service.getTrustedOrigins()).not.toContain('https://old.example.com')
    })

    test('공개 주소를 비우면 hostname 도 제거한다', async () => {
        const { getConfig, service } = createFixture()

        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://panel.example.com' })
        const cleared = await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: null })

        expect(cleared.nginxHostname).toBeNull()
        expect(readPanelServerNames(getConfig())).toEqual(['panel.containers.local', 'localhost', '127.0.0.1'])
    })

    test('추가 신뢰 origin 은 canonical origin 으로 정규화해 저장한다', async () => {
        const { service } = createFixture()

        const setting = await service.update('user-owner', {
            extraTrustedOrigins: ['https://ops.example.com/path', 'https://ops.example.com'],
            publicOrigin: null,
        })

        expect(setting.extraTrustedOrigins).toEqual(['https://ops.example.com', 'https://ops.example.com'])
        expect(service.getTrustedOrigins().filter((origin) => origin === 'https://ops.example.com')).toHaveLength(1)
    })

    test('부팅 origin 과 저장된 공개 주소가 다르면 재시작이 필요하다고 알린다', async () => {
        const { service } = createFixture()

        const setting = await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://panel.example.com' })

        expect(setting.restartRequired).toBe(true)
        expect(setting.bootOrigin).toBe(BOOT_ORIGIN)
    })

    test('공개 주소가 부팅 origin 과 같으면 재시작이 필요없다', async () => {
        const { service } = createFixture()

        const setting = await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: BOOT_ORIGIN })

        expect(setting.restartRequired).toBe(false)
    })

    test('절대 URL 이 아니면 거부한다', async () => {
        const { applied, service } = createFixture()

        await expect(service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'panel.example.com' })).rejects.toThrow()
        await expect(service.update('user-owner', { extraTrustedOrigins: ['ftp://x.example.com'], publicOrigin: null })).rejects.toThrow()
        expect(applied).toHaveLength(0)
    })

    test('hostname 이 그대로면 nginx 를 다시 적용하지 않는다', async () => {
        const { applied, service } = createFixture()

        await service.update('user-owner', { extraTrustedOrigins: [], publicOrigin: 'https://panel.example.com' })
        await service.update('user-owner', { extraTrustedOrigins: ['https://ops.example.com'], publicOrigin: 'https://panel.example.com' })

        expect(applied).toHaveLength(1)
    })
})
