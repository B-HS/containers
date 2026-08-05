import { randomUUID } from 'node:crypto'
import {
    nginxProxyRouteInputSchema,
    nginxProxyRouteListSchema,
    nginxProxyRouteMutationResultSchema,
    type NginxProxyRoute,
} from '@containers/contracts/nginx'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../../lib/error'

type NginxRouteRow = {
    bodySizeMegabytes: number
    createdAt: Date
    enabled: boolean
    hostname: string
    id: string
    path: string
    pathMode: NginxProxyRoute['pathMode']
    protocol: NginxProxyRoute['protocol']
    stripPrefix: boolean
    targetContainer: string
    targetPort: number
    timeoutSeconds: number
    updatedAt: Date
}

type NginxRouteIdRecord = {
    id: string
}

type NginxProxyRouteServiceDb = {
    list: () => Promise<NginxRouteRow[]>
    findCollision: (hostname: string, path: string, pathMode: NginxProxyRoute['pathMode']) => Promise<NginxRouteIdRecord | undefined>
    insert: (record: NginxRouteRow) => Promise<void>
    update: (id: string, record: Omit<NginxRouteRow, 'createdAt' | 'id' | 'updatedAt'> & { updatedAt: Date }) => Promise<void>
    delete: (id: string) => Promise<void>
}

type NginxProxyRouteServiceDependencies = {
    db: NginxProxyRouteServiceDb
    engineAgentClient: Pick<EngineAgentClient, 'applyNginxConfig' | 'getContainers' | 'getNginxConfig'>
    now: () => Date
    protectedContainers: string[]
    protectedHostnames: () => string[]
    routableNetworks: string[]
}

export type { NginxProxyRouteServiceDb }

const ROUTE_BLOCK_START = '# containers-routes:start'
const ROUTE_BLOCK_END = '# containers-routes:end'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderLocation = (route: NginxProxyRoute) => {
    const modifier = route.pathMode === 'exact' ? '= ' : '^~ '
    const rewrite = route.stripPrefix && route.path !== '/' ? `rewrite ^${escapeRegex(route.path)}/?(.*)$ /$1 break;` : ''
    const websocket = route.protocol === 'websocket' ? 'proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;' : ''

    return `location ${modifier}${route.path} { client_max_body_size ${route.bodySizeMegabytes}m; proxy_connect_timeout ${route.timeoutSeconds}s; proxy_read_timeout ${route.timeoutSeconds}s; proxy_send_timeout ${route.timeoutSeconds}s; ${rewrite} set $containers_route_upstream "http://${route.targetContainer}:${route.targetPort}"; proxy_pass $containers_route_upstream; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Request-ID $request_id; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $containers_forwarded_proto; proxy_set_header Cookie ""; proxy_set_header Authorization ""; ${websocket} proxy_buffering off; }`
}

export const renderNginxProxyRoutes = (currentConfig: string, routes: NginxProxyRoute[]) => {
    const existingStart = currentConfig.indexOf(ROUTE_BLOCK_START)
    const existingEnd = currentConfig.indexOf(ROUTE_BLOCK_END)
    const withoutRoutes =
        existingStart >= 0 && existingEnd > existingStart
            ? `${currentConfig.slice(0, existingStart)}${currentConfig.slice(existingEnd + ROUTE_BLOCK_END.length)}`
            : currentConfig
    const closingBraceIndex = withoutRoutes.lastIndexOf('}')
    if (closingBraceIndex < 0) {
        throw createAppError('NGINX_CONFIG_STRUCTURE_INVALID')
    }

    const grouped = new Map<string, NginxProxyRoute[]>()
    for (const route of routes.filter((candidate) => candidate.enabled)) {
        const hostRoutes = grouped.get(route.hostname) ?? []
        hostRoutes.push(route)
        grouped.set(route.hostname, hostRoutes)
    }

    const servers = [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([hostname, hostRoutes]) => {
            const hasPrefixRoot = hostRoutes.some((route) => route.path === '/' && route.pathMode === 'prefix')
            const locations = hostRoutes
                .sort((left, right) => left.path.localeCompare(right.path) || left.pathMode.localeCompare(right.pathMode))
                .map(renderLocation)
                .join('\n')
            const fallback = hasPrefixRoot ? '' : 'location / { return 404; }'
            return `server { listen 8080; server_name ${hostname}; ${locations} ${fallback} }`
        })
        .join('\n')
    const block = `${ROUTE_BLOCK_START}\n${servers}\n${ROUTE_BLOCK_END}\n`

    return `${withoutRoutes.slice(0, closingBraceIndex).trimEnd()}\n${block}${withoutRoutes.slice(closingBraceIndex).trimStart()}`
}

const toUpdateRecord = (route: NginxProxyRoute) => ({
    bodySizeMegabytes: route.bodySizeMegabytes,
    enabled: route.enabled,
    hostname: route.hostname,
    path: route.path,
    pathMode: route.pathMode,
    protocol: route.protocol,
    stripPrefix: route.stripPrefix,
    targetContainer: route.targetContainer,
    targetPort: route.targetPort,
    timeoutSeconds: route.timeoutSeconds,
    updatedAt: new Date(route.updatedAt),
})

const toInsertRecord = (route: NginxProxyRoute): NginxRouteRow => ({
    ...toUpdateRecord(route),
    createdAt: new Date(route.createdAt),
    id: route.id,
})

const describeFailure = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const createNginxProxyRouteService = ({
    db,
    engineAgentClient,
    now,
    protectedContainers,
    protectedHostnames,
    routableNetworks,
}: NginxProxyRouteServiceDependencies) => {
    let pending: Promise<unknown> = Promise.resolve()

    const serialize = <T>(task: () => Promise<T>) => {
        const next = pending.then(task, task)
        pending = next.then(
            () => undefined,
            () => undefined,
        )
        return next
    }

    const assertProtectedTarget = (payload: { targetContainer: string }) => {
        if (protectedContainers.includes(payload.targetContainer)) {
            throw createAppError('NGINX_ROUTE_PROTECTED_TARGET')
        }
    }

    /**
     * Rejects targets nginx could never reach. The rendered config resolves the upstream through a
     * variable, so nginx validates and reloads even when the container does not exist and the
     * mistake only surfaces as a 502 on the public domain. Being stopped is allowed because a route
     * may legitimately be prepared before its container runs.
     */
    const assertReachableTarget = async (payload: { targetContainer: string }) => {
        const containers = await engineAgentClient.getContainers()
        const target = containers.find((container) => container.names.includes(payload.targetContainer))
        if (target === undefined) {
            throw createAppError('NGINX_ROUTE_TARGET_NOT_FOUND')
        }
        if (target.state === 'running' && !target.networks.some((network) => routableNetworks.includes(network))) {
            throw createAppError('NGINX_ROUTE_TARGET_UNREACHABLE')
        }
    }
    const list = async () =>
        nginxProxyRouteListSchema.parse(
            (await db.list()).map((route) => ({
                ...route,
                createdAt: route.createdAt.toISOString(),
                updatedAt: route.updatedAt.toISOString(),
            })),
        )

    const applyRoutes = async (routes: NginxProxyRoute[]) => {
        const state = await engineAgentClient.getNginxConfig()
        return engineAgentClient.applyNginxConfig({
            config: renderNginxProxyRoutes(state.config, routes),
            expectedSha256: state.sha256,
        })
    }

    const applyWithCompensation = async (routes: NginxProxyRoute[], compensate: () => Promise<void>) => {
        try {
            return await applyRoutes(routes)
        } catch (error) {
            try {
                await compensate()
            } catch (compensationError) {
                throw createAppError('NGINX_CONFIG_APPLY_FAILED', error, {
                    applyFailure: describeFailure(error),
                    compensationFailure: describeFailure(compensationError),
                    compensationSucceeded: false,
                })
            }
            throw error
        }
    }

    return {
        create: async (input: unknown) =>
            serialize(async () => {
                const payload = nginxProxyRouteInputSchema.parse(input)
                if (protectedHostnames().includes(payload.hostname)) {
                    throw createAppError('NGINX_ROUTE_PROTECTED_HOSTNAME')
                }
                assertProtectedTarget(payload)
                await assertReachableTarget(payload)
                const collision = await db.findCollision(payload.hostname, payload.path, payload.pathMode)
                if (collision !== undefined) {
                    throw createAppError('NGINX_ROUTE_COLLISION')
                }

                const timestamp = now()
                const route = nginxProxyRouteListSchema.element.parse({
                    ...payload,
                    createdAt: timestamp.toISOString(),
                    id: randomUUID(),
                    updatedAt: timestamp.toISOString(),
                })
                const routes = [...(await list()), route]
                await db.insert(toInsertRecord(route))
                const result = await applyWithCompensation(routes, () => db.delete(route.id))
                return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
            }),
        list,
        reconcileRoutes: async () =>
            serialize(async () => {
                const routes = await list()
                const state = await engineAgentClient.getNginxConfig()
                const config = renderNginxProxyRoutes(state.config, routes)
                if (config === state.config) {
                    return { applied: false, configSha256: state.sha256 }
                }
                const result = await engineAgentClient.applyNginxConfig({ config, expectedSha256: state.sha256 })
                return { applied: true, configSha256: result.sha256 }
            }),
        remove: async (id: string, confirmation: string) =>
            serialize(async () => {
                const routes = await list()
                const route = routes.find((candidate) => candidate.id === id)
                if (!route) {
                    throw createAppError('NGINX_ROUTE_NOT_FOUND')
                }
                if (confirmation !== `${route.hostname}${route.path}`) {
                    throw createAppError('CONFIRMATION_MISMATCH')
                }
                await db.delete(id)
                const result = await applyWithCompensation(
                    routes.filter((candidate) => candidate.id !== id),
                    () => db.insert(toInsertRecord(route)),
                )
                return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
            }),
        upsert: async (input: unknown) =>
            serialize(async () => {
                const payload = nginxProxyRouteInputSchema.parse(input)
                if (protectedHostnames().includes(payload.hostname)) {
                    throw createAppError('NGINX_ROUTE_PROTECTED_HOSTNAME')
                }
                assertProtectedTarget(payload)
                await assertReachableTarget(payload)
                const current = await list()
                const existing = current.find(
                    (route) => route.hostname === payload.hostname && route.path === payload.path && route.pathMode === payload.pathMode,
                )
                const timestamp = now()
                const route = nginxProxyRouteListSchema.element.parse({
                    ...payload,
                    createdAt: existing?.createdAt ?? timestamp.toISOString(),
                    id: existing?.id ?? randomUUID(),
                    updatedAt: timestamp.toISOString(),
                })
                const routes = [...current.filter((candidate) => candidate.id !== existing?.id), route]
                if (existing) {
                    await db.update(existing.id, { ...payload, updatedAt: timestamp })
                } else {
                    await db.insert(toInsertRecord(route))
                }
                const result = await applyWithCompensation(routes, () =>
                    existing ? db.update(existing.id, toUpdateRecord(existing)) : db.delete(route.id),
                )
                return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
            }),
    }
}

export type NginxProxyRouteService = ReturnType<typeof createNginxProxyRouteService>
