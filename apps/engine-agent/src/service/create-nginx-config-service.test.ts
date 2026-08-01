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

const createTestContext = async (validationExitCode = 0) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-nginx-config-'))
    temporaryDirectories.push(directory)
    const currentConfig = await readFile(resolve(process.cwd(), 'infra/nginx/nginx.conf'), 'utf8')
    await writeFile(join(directory, 'current.conf'), currentConfig)
    const signals: string[] = []
    const service = createNginxConfigService({
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
                    Labels: { 'com.docker.compose.service': 'nginx' },
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

    test('rate limit과 panel 보안 header를 raw config에서도 제거할 수 없습니다', async () => {
        const { currentConfig, service } = await createTestContext()
        const withoutSecurityHeaders = currentConfig.replace(/\s*add_header Content-Security-Policy[^\n]+\n/, '\n')
        const withoutRateLimit = currentConfig.replace('limit_req_zone $containers_client_ip zone=containers_auth_rate:10m rate=5r/m;', '')

        await expect(service.apply({ config: withoutSecurityHeaders, expectedSha256: digest(currentConfig) })).rejects.toThrow(
            'NGINX_PROTECTED_CONTRACT',
        )
        await expect(service.apply({ config: withoutRateLimit, expectedSha256: digest(currentConfig) })).rejects.toThrow('NGINX_PROTECTED_CONTRACT')
    })
})
