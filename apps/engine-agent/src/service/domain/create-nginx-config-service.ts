import { createHash, randomUUID } from 'node:crypto'
import { access, copyFile, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nginxConfigApplyResultSchema, nginxConfigApplySchema, nginxConfigRevisionSchema, nginxConfigStateSchema } from '@containers/contracts/nginx'
import type { DockerEngineClient } from '../shared/create-docker-engine-client'
import { createAppError } from '../../lib/error'

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const MANAGEMENT_LABEL = 'managed-by'
const MANAGEMENT_LABEL_VALUE = 'containers-control-plane'
const MANAGEMENT_PROJECT = 'containers'

const isManagementPlaneResource = (labels: Record<string, string>) =>
    labels[COMPOSE_PROJECT_LABEL] === MANAGEMENT_PROJECT || labels[MANAGEMENT_LABEL] === MANAGEMENT_LABEL_VALUE

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
    'upstream containers_api',
    'upstream containers_web',
    'server api:3001',
    'server web:3000',
    'map $remote_addr $containers_client_ip',
    'limit_req_zone $containers_client_ip zone=containers_api_rate:10m rate=300r/m;',
    'limit_req_zone $containers_client_ip zone=containers_auth_rate:10m rate=5r/m;',
    'limit_req_status 429;',
    'limit_req zone=containers_api_rate',
    'limit_req zone=containers_auth_rate',
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

const stripComments = (config: string) =>
    config
        .split('\n')
        .map((line) => {
            let inSingleQuote = false
            let inDoubleQuote = false
            for (let index = 0; index < line.length; index += 1) {
                const character = line[index]
                if (character === "'" && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote
                } else if (character === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote
                } else if (character === '#' && !inSingleQuote && !inDoubleQuote) {
                    return line.slice(0, index)
                }
            }
            return line
        })
        .join('\n')

const extractServerBlock = (config: string, serverName: string) => {
    const serverStart = config.indexOf(`server_name ${serverName}`)
    if (serverStart < 0) {
        return ''
    }
    const blockStart = config.lastIndexOf('server {', serverStart)
    if (blockStart < 0) {
        return ''
    }
    let depth = 0
    let index = blockStart
    for (; index < config.length; index += 1) {
        const character = config[index]
        if (character === '{') {
            depth += 1
        } else if (character === '}') {
            depth -= 1
            if (depth === 0) {
                break
            }
        }
    }
    return depth === 0 ? config.slice(blockStart, index + 1) : ''
}

const stripNestedBlocks = (block: string) => {
    let result = ''
    let depth = 0
    for (let index = 0; index < block.length; index += 1) {
        const character = block[index]
        if (character === '{') {
            depth += 1
            if (depth > 1) {
                continue
            }
        } else if (character === '}') {
            depth -= 1
            if (depth === 0) {
                result += character
            }
            continue
        }
        if (depth <= 1) {
            result += character
        }
    }
    return result
}

const extractLocation = (block: string, locationPattern: RegExp) => {
    const match = locationPattern.exec(block)
    if (!match) {
        return ''
    }
    const locationStart = match.index
    const braceStart = block.indexOf('{', locationStart)
    if (braceStart < 0) {
        return ''
    }
    let depth = 0
    let index = braceStart
    for (; index < block.length; index += 1) {
        const character = block[index]
        if (character === '{') {
            depth += 1
        } else if (character === '}') {
            depth -= 1
            if (depth === 0) {
                break
            }
        }
    }
    const full = depth === 0 ? block.slice(locationStart, index + 1) : ''
    return full === '' ? '' : stripNestedBlocks(full)
}

const verifyProtectedContract = (config: string) => {
    if (config.includes('\0')) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const activeConfig = stripComments(config)
    if (REQUIRED_CONFIG_TOKENS.some((token) => !activeConfig.includes(token))) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const panelBlock = extractServerBlock(activeConfig, 'panel.containers.local')
    if (
        !panelBlock ||
        !panelBlock.includes('listen 8080') ||
        !panelBlock.includes('add_header Content-Security-Policy') ||
        !panelBlock.includes('add_header X-Frame-Options') ||
        !panelBlock.includes('add_header X-Content-Type-Options') ||
        !panelBlock.includes('proxy_pass http://containers_api;') ||
        !panelBlock.includes('proxy_pass http://containers_web;')
    ) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const apiLocation = extractLocation(panelBlock, /location \/api\//)
    if (!apiLocation || !apiLocation.includes('limit_req zone=containers_api_rate') || hasExcessiveBurst(apiLocation, 1_000)) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const authLocation = extractLocation(panelBlock, /location\s+~\s+\^\/api\/auth\/sign-in\/email/)
    if (!authLocation || !authLocation.includes('limit_req zone=containers_auth_rate') || hasExcessiveBurst(authLocation, 100)) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const apiBlock = extractServerBlock(activeConfig, 'api.containers.local')
    const apiBlockApiLocation = extractLocation(apiBlock, /location \/api\//)
    if (
        !apiBlockApiLocation ||
        !apiBlockApiLocation.includes('limit_req zone=containers_api_rate') ||
        hasExcessiveBurst(apiBlockApiLocation, 1_000)
    ) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
}

const hasExcessiveBurst = (location: string, maxBurst: number) => {
    const match = location.match(/limit_req\s+zone=[a-z_]+_rate\s+burst=(\d+)/)
    if (!match) {
        return false
    }
    return Number.parseInt(match[1] ?? '0', 10) > maxBurst
}

export const createNginxConfigService = ({ configRoot, dockerEngineClient, fetcher = fetch, now, statusUrl }: NginxConfigServiceDependencies) => {
    const currentPath = join(configRoot, 'current.conf')

    const getNginxContainer = async () => {
        const containers = await dockerEngineClient.getContainers()
        const container = containers.find(
            (candidate) =>
                candidate.Labels['com.docker.compose.service'] === 'nginx' &&
                isManagementPlaneResource(candidate.Labels) &&
                candidate.State === 'running',
        )
        if (!container) {
            throw createAppError('NGINX_CONTAINER_UNAVAILABLE')
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
        throw createAppError('NGINX_POST_RELOAD_PROBE_FAILED')
    }

    return {
        apply: async (input: unknown) => {
            const payload = nginxConfigApplySchema.parse(input)
            verifyProtectedContract(payload.config)
            const currentConfig = await readFile(currentPath, 'utf8')
            const previousSha256 = digest(currentConfig)
            if (previousSha256 !== payload.expectedSha256) {
                throw createAppError('NGINX_CONFIG_CONFLICT')
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
                throw createAppError(`NGINX_CONFIG_INVALID:${validationOutput}`)
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
