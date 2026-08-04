import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createNginxConfigService } from './create-nginx-config-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

const createTestContext = async (validationExitCode = 0, fetcher?: (input: string, init?: RequestInit) => Promise<Response>) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-nginx-config-'))
    temporaryDirectories.push(directory)
    const currentConfig = await readFile(resolve(process.cwd(), 'infra/nginx/nginx.conf'), 'utf8')
    await writeFile(join(directory, 'current.conf'), currentConfig)
    const signals: string[] = []
    const service = createNginxConfigService({
        ...(fetcher === undefined ? {} : { fetcher }),
        configRoot: directory,
        dockerEngineClient: {
            executeContainer: async () => ({
                exitCode: validationExitCode,
                stderr: validationExitCode === 0 ? 'syntax is ok' : 'invalid directive',
                stdout: '',
                truncated: false,
            }),
            getContainers: async () => [
                {
                    Command: 'nginx',
                    Created: 1,
                    Id: 'nginx-container-id',
                    Image: 'containers-nginx',
                    ImageID: 'sha256:nginx',
                    Labels: { 'com.docker.compose.project': 'containers', 'com.docker.compose.service': 'nginx' },
                    Names: ['/containers-nginx-1'],
                    State: 'running',
                    Status: 'Up',
                },
            ],
            signalContainer: async (_containerId: string, signal: string) => {
                signals.push(signal)
            },
        },
        now: () => new Date('2026-07-31T00:00:00.000Z'),
        statusUrl: 'data:text/plain,ok',
    })

    return { currentConfig, directory, service, signals }
}

describe('Nginx 설정 서비스', () => {
    test('syntax 검증 후 current를 원자적으로 교체하고 HUP을 보냅니다', async () => {
        const { currentConfig, directory, service, signals } = await createTestContext()
        const nextConfig = `${currentConfig}\n`
        const result = await service.apply({ config: nextConfig, expectedSha256: digest(currentConfig) })
        const state = await service.getState()

        expect(result.sha256).toBe(digest(nextConfig))
        expect(await readFile(join(directory, 'current.conf'), 'utf8')).toBe(nextConfig)
        expect(state.history[0]?.sha256).toBe(digest(currentConfig))
        expect(signals).toEqual(['HUP'])
    })

    test('syntax 실패 시 current를 유지하고 candidate를 정리합니다', async () => {
        const { currentConfig, directory, service } = await createTestContext(1)

        await expect(service.apply({ config: `${currentConfig}\n`, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_CONFIG_INVALID')
        expect(await readFile(join(directory, 'current.conf'), 'utf8')).toBe(currentConfig)
        expect(await readdir(directory)).toEqual(['current.conf'])
    })

    test('관리 경로를 제거하는 설정과 stale revision을 거부합니다', async () => {
        const { currentConfig, service } = await createTestContext()

        await expect(service.apply({ config: 'events {}', expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
        await expect(service.apply({ config: currentConfig, expectedSha256: 'a'.repeat(64) })).rejects.toThrow('NGINX_CONFIG_CONFLICT')
    })

    test('probe가 non-2xx를 반환하면 지연을 두고 재시도한 뒤 롤백합니다', async () => {
        const RECOVERY_CALL_INDEX = 5
        const MINIMUM_ELAPSED_MS = 900
        let calls = 0
        const { currentConfig, directory, service, signals } = await createTestContext(0, async () => {
            calls += 1
            return new Response(null, { status: calls > RECOVERY_CALL_INDEX ? 200 : 503 })
        })
        const startedAt = Date.now()

        await expect(service.apply({ config: `${currentConfig}\n`, expectedSha256: digest(currentConfig) })).rejects.toThrow(
            'NGINX_POST_RELOAD_PROBE_FAILED',
        )

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(MINIMUM_ELAPSED_MS)
        expect(calls).toBe(RECOVERY_CALL_INDEX + 1)
        expect(signals).toEqual(['HUP', 'HUP'])
        expect(await readFile(join(directory, 'current.conf'), 'utf8')).toBe(currentConfig)
    })

    test('롤백 후에도 probe가 실패하면 롤백 실패를 결과에 반영합니다', async () => {
        const { currentConfig, service } = await createTestContext(0, async () => new Response(null, { status: 503 }))

        await expect(service.apply({ config: `${currentConfig}\n`, expectedSha256: digest(currentConfig) })).rejects.toThrow(
            'NGINX_POST_RELOAD_PROBE_FAILED:ROLLBACK_UNHEALTHY',
        )
    })

    test('rate limit과 panel 보안 header를 raw config에서도 제거할 수 없습니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const withoutSecurityHeaders = currentConfig.replace(/\s*add_header Content-Security-Policy[^\n]+\n/, '\n')
        const withoutRateLimit = currentConfig.replace('limit_req_zone $containers_client_ip zone=containers_auth_rate:10m rate=5r/m;', '')

        await expect(service.apply({ config: withoutSecurityHeaders, expectedSha256: digest(currentConfig) })).rejects.toThrow(
            'NGINX_PROTECTED_CONTRACT',
        )
        await expect(service.apply({ config: withoutRateLimit, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })

    test('실제 nginx.conf는 보호 계약을 통과합니다', async () => {
        const { currentConfig, service } = await createTestContext()

        const result = await service.apply({ config: `${currentConfig}\n`, expectedSha256: digest(currentConfig) })

        expect(result.previousSha256).toBe(digest(currentConfig))
    })

    test('proxy route 렌더러가 넣는 관리 마커 주석이 있어도 통과합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const lastBrace = currentConfig.lastIndexOf('}')
        const withMarkers = `${currentConfig.slice(0, lastBrace)}# containers-routes:start\n\n# containers-routes:end\n${currentConfig.slice(lastBrace)}`

        const result = await service.apply({ config: withMarkers, expectedSha256: digest(currentConfig) })

        expect(result.sha256).toBe(digest(withMarkers))
    })

    test('server_name에 panel 도메인이 다른 이름과 함께 나열돼도 통과합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const withAliasServerName = currentConfig.replace(
            'server_name panel.containers.local;',
            'server_name panel.containers.local admin.containers.local;',
        )

        const result = await service.apply({ config: withAliasServerName, expectedSha256: digest(currentConfig) })

        expect(result.sha256).toBe(digest(withAliasServerName))
    })

    test('앞에 배치한 decoy panel server 블록을 거부합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const decoyServer = `
    server {
        listen 8080;
        server_name panel.containers.local;

        location /api/ {
            proxy_pass http://containers_api;
        }

        location / {
            proxy_pass http://containers_web;
        }
    }
`
        const withDecoy = currentConfig.replace('http {\n', `http {\n${decoyServer}`)

        await expect(service.apply({ config: withDecoy, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })

    test('rate limit이 없는 두 번째 /api/ location을 거부합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const duplicatedApiLocation = `        location /api/ {
            proxy_pass http://containers_api;
        }

        location / {
            proxy_pass http://containers_web;`
        const withDuplicate = currentConfig.replace(
            `        location / {
            proxy_pass http://containers_web;`,
            duplicatedApiLocation,
        )

        await expect(service.apply({ config: withDuplicate, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })

    test('다른 location으로 감싼 nested /api/ 우회를 거부합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const nestedBypass = `        location /internal/ {
            limit_req zone=containers_auth_rate burst=5 nodelay;

            location /api/ {
                proxy_pass http://containers_api;
            }
        }

        location / {
            proxy_pass http://containers_web;`
        const withNestedBypass = currentConfig.replace(
            `        location / {
            proxy_pass http://containers_web;`,
            nestedBypass,
        )

        await expect(service.apply({ config: withNestedBypass, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })

    test('burst 상한을 넘긴 /api/ rate limit을 거부합니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const withExcessiveBurst = currentConfig.replace(
            'limit_req zone=containers_api_rate burst=100 nodelay;',
            'limit_req zone=containers_api_rate burst=5000 nodelay;',
        )

        await expect(service.apply({ config: withExcessiveBurst, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })
})
