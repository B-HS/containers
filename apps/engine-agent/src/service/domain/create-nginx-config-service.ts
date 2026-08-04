import { createHash, randomUUID } from 'node:crypto'
import { access, copyFile, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nginxConfigApplyResultSchema, nginxConfigApplySchema, nginxConfigRevisionSchema, nginxConfigStateSchema } from '@containers/contracts/nginx'
import type { NginxBlock, NginxDirective } from '@containers/nginx-config/parse'
import { parseNginxConfig } from '@containers/nginx-config/parse'
import { serializeNginxConfig } from '@containers/nginx-config/serialize'
import type { DockerEngineClient } from '../shared/create-docker-engine-client'
import { createAppError } from '../../lib/error'

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const MANAGEMENT_LABEL = 'managed-by'
const MANAGEMENT_LABEL_VALUE = 'containers-control-plane'
const MANAGEMENT_PROJECT = 'containers'

const isManagementPlaneResource = (labels: Record<string, string>) =>
    labels[COMPOSE_PROJECT_LABEL] === MANAGEMENT_PROJECT || labels[MANAGEMENT_LABEL] === MANAGEMENT_LABEL_VALUE

const PANEL_SERVER_NAME = 'panel.containers.local'
const API_SERVER_NAME = 'api.containers.local'
const PANEL_LISTEN_PORT = '8080'
const STATUS_LISTEN_PORT = '8081'
const STATUS_LOCATION_PATH = '/status'
const API_LOCATION_PATH = '/api/'
const API_UPSTREAM_NAME = 'containers_api'
const WEB_UPSTREAM_NAME = 'containers_web'
const API_UPSTREAM_TARGET = 'http://containers_api'
const WEB_UPSTREAM_TARGET = 'http://containers_web'
const API_UPSTREAM_SERVER = 'api:3001'
const WEB_UPSTREAM_SERVER = 'web:3000'
const API_RATE_ZONE = 'containers_api_rate'
const AUTH_RATE_ZONE = 'containers_auth_rate'
const API_BURST_LIMIT = 1_000
const AUTH_BURST_LIMIT = 100
const CLIENT_IP_MAP_SOURCE = '$remote_addr'
const CLIENT_IP_MAP_TARGET = '$containers_client_ip'
const PANEL_REQUIRED_HEADERS = ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options']
const API_REQUIRED_HEADERS = ['X-Content-Type-Options', 'X-Frame-Options']
const SIGN_IN_LOCATION_PATTERN = /^\^\/api\/auth\/sign-in\/email/
const BURST_ARGUMENT_PATTERN = /^burst=(\d+)$/

const REQUIRED_ROOT_DIRECTIVES = [{ args: ['/tmp/nginx.pid'], name: 'pid' }]

const REQUIRED_HTTP_DIRECTIVES = [
    { args: ['/var/log/nginx/access.jsonl', 'containers_json'], name: 'access_log' },
    { args: [CLIENT_IP_MAP_TARGET, `zone=${API_RATE_ZONE}:10m`, 'rate=300r/m'], name: 'limit_req_zone' },
    { args: [CLIENT_IP_MAP_TARGET, `zone=${AUTH_RATE_ZONE}:10m`, 'rate=5r/m'], name: 'limit_req_zone' },
    { args: ['429'], name: 'limit_req_status' },
]

const PROBE_MAX_ATTEMPTS = 5
const PROBE_RETRY_DELAY_MS = 250
const PROBE_TIMEOUT_MS = 2_000

type NginxConfigServiceDependencies = {
    configRoot: string
    dockerEngineClient: Pick<DockerEngineClient, 'executeContainer' | 'getContainers' | 'signalContainer'>
    fetcher?: (input: string, init?: RequestInit) => Promise<Response>
    now: () => Date
    statusUrl: string
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

const collectBlocks = (parent: NginxBlock, name: string) =>
    parent.children.filter((node): node is NginxBlock => node.kind === 'block' && node.name === name)

const collectDirectives = (parent: NginxBlock, name: string) =>
    parent.children.filter((node): node is NginxDirective => node.kind === 'directive' && node.name === name)

const collectDirectivesDeep = (parent: NginxBlock, name: string): NginxDirective[] =>
    parent.children.flatMap((node) => {
        if (node.kind === 'block') {
            return collectDirectivesDeep(node, name)
        }
        if (node.kind === 'directive' && node.name === name) {
            return [node]
        }
        return []
    })

const hasDirective = (parent: NginxBlock, name: string, requiredArgs: string[]) =>
    collectDirectives(parent, name).some((directive) => requiredArgs.every((argument) => directive.args.includes(argument)))

const stripTailComments = (tail: string) =>
    tail
        .split('\n')
        .map((line) => (line.trimStart().startsWith('#') ? '' : line))
        .join('')
        .trim()

const hasBalancedBlocks = (parent: NginxBlock): boolean =>
    parent.children.every((node) => node.kind !== 'block' || (stripTailComments(node.tail) === '}' && hasBalancedBlocks(node)))

type LocationContext = {
    ancestors: NginxBlock[]
    block: NginxBlock
}

const collectLocations = (parent: NginxBlock, ancestors: NginxBlock[]): LocationContext[] =>
    parent.children.flatMap((node) => {
        if (node.kind !== 'block') {
            return []
        }
        const nested = collectLocations(node, [node, ...ancestors])
        if (node.name !== 'location') {
            return nested
        }
        return [{ ancestors, block: node }, ...nested]
    })

const resolveLimitRequests = ({ ancestors, block }: LocationContext) => {
    for (const level of [block, ...ancestors]) {
        const directives = collectDirectives(level, 'limit_req')
        if (directives.length > 0) {
            return directives
        }
    }
    return []
}

const satisfiesRateLimit = (context: LocationContext, zone: string, maxBurst: number) => {
    const matched = resolveLimitRequests(context).filter((directive) => directive.args.includes(`zone=${zone}`))
    if (matched.length === 0) {
        return false
    }
    return matched.every((directive) =>
        directive.args.every((argument) => {
            const burst = BURST_ARGUMENT_PATTERN.exec(argument)
            if (burst === null) {
                return true
            }
            return Number.parseInt(burst[1] ?? '0', 10) <= maxBurst
        }),
    )
}

const isApiLocation = ({ block }: LocationContext) => {
    const [modifier, path] = block.args
    if (block.args.length === 1) {
        return modifier === API_LOCATION_PATH
    }
    return block.args.length === 2 && modifier === '^~' && path === API_LOCATION_PATH
}

const isSignInLocation = ({ block }: LocationContext) => {
    const [modifier, pattern] = block.args
    if (block.args.length !== 2 || pattern === undefined) {
        return false
    }
    return (modifier === '~' || modifier === '~*') && SIGN_IN_LOCATION_PATTERN.test(pattern)
}

const hasSecurityHeaders = (server: NginxBlock, requiredHeaders: string[]) => {
    const present = collectDirectives(server, 'add_header').map((directive) => directive.args[0])
    return requiredHeaders.every((header) => present.includes(header))
}

const satisfiesServerContract = (server: NginxBlock, requiredHeaders: string[], requiredProxyTargets: string[]) => {
    if (!hasDirective(server, 'listen', [PANEL_LISTEN_PORT]) || !hasSecurityHeaders(server, requiredHeaders)) {
        return false
    }
    const proxyTargets = collectDirectivesDeep(server, 'proxy_pass').map((directive) => directive.args[0])
    if (!requiredProxyTargets.every((target) => proxyTargets.includes(target))) {
        return false
    }
    const locations = collectLocations(server, [server])
    const apiLocations = locations.filter(isApiLocation)
    if (apiLocations.length === 0 || !apiLocations.every((location) => satisfiesRateLimit(location, API_RATE_ZONE, API_BURST_LIMIT))) {
        return false
    }
    const signInLocations = locations.filter(isSignInLocation)
    return signInLocations.length > 0 && signInLocations.every((location) => satisfiesRateLimit(location, AUTH_RATE_ZONE, AUTH_BURST_LIMIT))
}

const findServersByName = (http: NginxBlock, serverName: string) =>
    collectBlocks(http, 'server').filter((server) =>
        collectDirectives(server, 'server_name').some((directive) => directive.args.includes(serverName)),
    )

const hasClientIpMap = (http: NginxBlock) =>
    collectBlocks(http, 'map').some((map) => map.args.length === 2 && map.args[0] === CLIENT_IP_MAP_SOURCE && map.args[1] === CLIENT_IP_MAP_TARGET)

const hasStatusServer = (http: NginxBlock) =>
    collectBlocks(http, 'server').some((server) => {
        if (!hasDirective(server, 'listen', [STATUS_LISTEN_PORT])) {
            return false
        }
        return collectBlocks(server, 'location').some(
            (location) =>
                location.args.length === 2 &&
                location.args[0] === '=' &&
                location.args[1] === STATUS_LOCATION_PATH &&
                collectDirectives(location, 'stub_status').length > 0,
        )
    })

const hasUpstream = (http: NginxBlock, name: string, target: string) =>
    collectBlocks(http, 'upstream').some((upstream) => upstream.args.includes(name) && hasDirective(upstream, 'server', [target]))

const verifyProtectedContract = (config: string) => {
    if (config.includes('\0')) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const root = parseNginxConfig(config)
    if (serializeNginxConfig(root) !== config || root.tail !== '' || !hasBalancedBlocks(root)) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const httpBlocks = collectBlocks(root, 'http')
    const [http] = httpBlocks
    if (httpBlocks.length !== 1 || http === undefined) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    if (
        !REQUIRED_ROOT_DIRECTIVES.every(({ args, name }) => hasDirective(root, name, args)) ||
        !REQUIRED_HTTP_DIRECTIVES.every(({ args, name }) => hasDirective(http, name, args))
    ) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    if (
        !hasClientIpMap(http) ||
        !hasStatusServer(http) ||
        !hasUpstream(http, API_UPSTREAM_NAME, API_UPSTREAM_SERVER) ||
        !hasUpstream(http, WEB_UPSTREAM_NAME, WEB_UPSTREAM_SERVER)
    ) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const panelServers = findServersByName(http, PANEL_SERVER_NAME)
    if (
        panelServers.length === 0 ||
        !panelServers.every((server) => satisfiesServerContract(server, PANEL_REQUIRED_HEADERS, [API_UPSTREAM_TARGET, WEB_UPSTREAM_TARGET]))
    ) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
    const apiServers = findServersByName(http, API_SERVER_NAME)
    if (apiServers.length === 0 || !apiServers.every((server) => satisfiesServerContract(server, API_REQUIRED_HEADERS, [API_UPSTREAM_TARGET]))) {
        throw createAppError('NGINX_PROTECTED_CONTRACT')
    }
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

    const probeOnce = async () => {
        try {
            const response = await fetcher(statusUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
            return response.ok
        } catch {
            return false
        }
    }

    const probeUntilHealthy = async () => {
        for (let attempt = 0; attempt < PROBE_MAX_ATTEMPTS; attempt += 1) {
            if (await probeOnce()) {
                return true
            }
            if (attempt < PROBE_MAX_ATTEMPTS - 1) {
                await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS))
            }
        }
        return false
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
                if (!(await probeUntilHealthy())) {
                    throw createAppError('NGINX_POST_RELOAD_PROBE_FAILED')
                }
            } catch (error) {
                await copyFile(previousRevisionPath, currentPath)
                await dockerEngineClient.signalContainer(nginxContainer.Id, 'HUP')
                if (!(await probeUntilHealthy())) {
                    throw createAppError('NGINX_POST_RELOAD_PROBE_FAILED:ROLLBACK_UNHEALTHY', error)
                }
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
