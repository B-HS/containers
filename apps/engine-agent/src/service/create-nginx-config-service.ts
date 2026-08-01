import { createHash, randomUUID } from 'node:crypto'
import { access, copyFile, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nginxConfigApplyResultSchema, nginxConfigApplySchema, nginxConfigRevisionSchema, nginxConfigStateSchema } from '@containers/contracts/nginx'
import type { DockerEngineClient } from '../docker/create-docker-engine-client'

const REQUIRED_CONFIG_TOKENS = [
    'pid /tmp/nginx.pid;',
    'access_log /var/log/nginx/access.jsonl containers_json;',
    'listen 8080',
    'listen 8081',
    'location /api/',
    'location = /status',
    'stub_status;',
    'proxy_pass http://containers_api;',
    'proxy_pass http://containers_web;',
    'map $http_cf_connecting_ip $containers_client_ip',
    'limit_req_zone $containers_client_ip zone=containers_api_rate:10m rate=300r/m;',
    'limit_req_zone $containers_client_ip zone=containers_auth_rate:10m rate=5r/m;',
    'limit_req_status 429;',
    'Content-Security-Policy',
    'X-Content-Type-Options "nosniff" always;',
    'X-Frame-Options "DENY" always;',
]

type NginxConfigServiceDependencies = {
    configRoot: string
    dockerEngineClient: Pick<DockerEngineClient, 'executeContainer' | 'getContainers' | 'signalContainer'>
    fetcher?: typeof fetch
    now: () => Date
    statusUrl: string
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

const verifyProtectedContract = (config: string) => {
    if (config.includes('\0') || REQUIRED_CONFIG_TOKENS.some((token) => !config.includes(token))) {
        throw new Error('NGINX_PROTECTED_CONTRACT')
    }
}

export const createNginxConfigService = ({ configRoot, dockerEngineClient, fetcher = fetch, now, statusUrl }: NginxConfigServiceDependencies) => {
    const currentPath = join(configRoot, 'current.conf')

    const getNginxContainer = async () => {
        const containers = await dockerEngineClient.getContainers()
        const container = containers.find((candidate) => candidate.Labels['com.docker.compose.service'] === 'nginx' && candidate.State === 'running')
        if (!container) {
            throw new Error('NGINX_CONTAINER_UNAVAILABLE')
        }
        return container
    }

    const probeStatus = async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const response = await fetcher(statusUrl, { signal: AbortSignal.timeout(2_000) })
                if (response.ok) {
                    return
                }
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 250))
            }
        }
        throw new Error('NGINX_POST_RELOAD_PROBE_FAILED')
    }

    return {
        apply: async (input: unknown) => {
            const payload = nginxConfigApplySchema.parse(input)
            verifyProtectedContract(payload.config)
            const currentConfig = await readFile(currentPath, 'utf8')
            const previousSha256 = digest(currentConfig)
            if (previousSha256 !== payload.expectedSha256) {
                throw new Error('NGINX_CONFIG_CONFLICT')
            }

            const sha256 = digest(payload.config)
            const candidateName = `${randomUUID()}.candidate`
            const candidatePath = join(configRoot, candidateName)
            const containerCandidatePath = `/etc/nginx/managed/${candidateName}`
            await writeFile(candidatePath, payload.config, { encoding: 'utf8', flag: 'wx', mode: 0o640 })
            const nginxContainer = await getNginxContainer()
            const validation = await dockerEngineClient.executeContainer(nginxContainer.Id, {
                command: ['nginx', '-t', '-c', containerCandidatePath],
                environment: [],
                maxOutputBytes: 1_048_576,
                timeoutMs: 30_000,
            })
            const validationOutput = `${validation.stdout}${validation.stderr}`
            if (validation.exitCode !== 0 || validation.truncated) {
                await rm(candidatePath, { force: true })
                throw new Error(`NGINX_CONFIG_INVALID:${validationOutput}`)
            }

            const previousRevisionPath = join(configRoot, `${previousSha256}.revision`)
            try {
                await access(previousRevisionPath)
            } catch {
                await copyFile(currentPath, previousRevisionPath)
            }
            await rename(candidatePath, currentPath)

            try {
                await dockerEngineClient.signalContainer(nginxContainer.Id, 'HUP')
                await probeStatus()
            } catch (error) {
                await copyFile(previousRevisionPath, currentPath)
                await dockerEngineClient.signalContainer(nginxContainer.Id, 'HUP')
                throw error
            }

            return nginxConfigApplyResultSchema.parse({
                appliedAt: now().toISOString(),
                previousSha256,
                sha256,
                validationOutput,
            })
        },
        getState: async () => {
            const config = await readFile(currentPath, 'utf8')
            const entries = await readdir(configRoot)
            const history = await Promise.all(
                entries
                    .filter((entry) => /^[a-f0-9]{64}\.revision$/.test(entry))
                    .map(async (entry) => {
                        const metadata = await stat(join(configRoot, entry))
                        return nginxConfigRevisionSchema.parse({
                            createdAt: metadata.mtime.toISOString(),
                            sha256: entry.slice(0, 64),
                        })
                    }),
            )
            history.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            return nginxConfigStateSchema.parse({ config, history, sha256: digest(config) })
        },
    }
}

export type NginxConfigService = ReturnType<typeof createNginxConfigService>
