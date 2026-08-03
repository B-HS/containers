import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import {
    nginxProxyRouteInputSchema,
    nginxProxyRouteListSchema,
    nginxProxyRouteMutationResultSchema,
    type NginxProxyRoute,
} from '@containers/contracts/nginx'
import type { ControlDatabase } from '@containers/db-schema/database'
import { nginxRoute } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import { createAppError } from '../../../lib/app-error'

type NginxProxyRouteServiceDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'applyNginxConfig' | 'getNginxConfig'>
    now: () => Date
    protectedContainers: string[]
    protectedHostnames: string[]
}

const ROUTE_BLOCK_START = '# containers-routes:start'
const ROUTE_BLOCK_END = '# containers-routes:end'

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderLocation = (route: NginxProxyRoute) => {
    const modifier = route.pathMode === 'exact' ? '= ' : '^~ '
    const rewrite = route.stripPrefix && route.path !== '/' ? `rewrite ^${escapeRegex(route.path)}/?(.*)$ /$1 break;` : ''
    const websocket = route.protocol === 'websocket' ? 'proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;' : ''

    return `location ${modifier}${route.path} { client_max_body_size ${route.bodySizeMegabytes}m; proxy_connect_timeout ${route.timeoutSeconds}s; proxy_read_timeout ${route.timeoutSeconds}s; proxy_send_timeout ${route.timeoutSeconds}s; ${rewrite} set $containers_route_upstream "http://${route.targetContainer}:${route.targetPort}"; proxy_pass $containers_route_upstream; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Request-ID $request_id; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header Cookie ""; proxy_set_header Authorization ""; ${websocket} proxy_buffering off; }`
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

export const createNginxProxyRouteService = ({
    db,
    engineAgentClient,
    now,
    protectedContainers,
    protectedHostnames,
}: NginxProxyRouteServiceDependencies) => {
    const assertProtectedTarget = (payload: { targetContainer: string }) => {
        if (protectedContainers.includes(payload.targetContainer)) {
            throw createAppError('NGINX_ROUTE_PROTECTED_TARGET')
        }
    }
    const list = async () =>
        nginxProxyRouteListSchema.parse(
            (await db.select().from(nginxRoute).orderBy(asc(nginxRoute.hostname), asc(nginxRoute.path))).map((route) => ({
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

    return {
        create: async (input: unknown) => {
            const payload = nginxProxyRouteInputSchema.parse(input)
            if (protectedHostnames.includes(payload.hostname)) {
                throw createAppError('NGINX_ROUTE_PROTECTED_HOSTNAME')
            }
            assertProtectedTarget(payload)
            const collision = await db
                .select({ id: nginxRoute.id })
                .from(nginxRoute)
                .where(and(eq(nginxRoute.hostname, payload.hostname), eq(nginxRoute.path, payload.path), eq(nginxRoute.pathMode, payload.pathMode)))
                .limit(1)
            if (collision.length > 0) {
                throw createAppError('NGINX_ROUTE_COLLISION')
            }

            const timestamp = now()
            const route = nginxProxyRouteListSchema.element.parse({
                ...payload,
                createdAt: timestamp.toISOString(),
                id: randomUUID(),
                updatedAt: timestamp.toISOString(),
            })
            const result = await applyRoutes([...(await list()), route])
            await db.insert(nginxRoute).values({
                ...payload,
                createdAt: timestamp,
                id: route.id,
                updatedAt: timestamp,
            })
            return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
        },
        list,
        remove: async (id: string, confirmation: string) => {
            const route = (await list()).find((candidate) => candidate.id === id)
            if (!route) {
                throw createAppError('NGINX_ROUTE_NOT_FOUND')
            }
            if (confirmation !== `${route.hostname}${route.path}`) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            const result = await applyRoutes((await list()).filter((candidate) => candidate.id !== id))
            await db.delete(nginxRoute).where(eq(nginxRoute.id, id))
            return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
        },
        upsert: async (input: unknown) => {
            const payload = nginxProxyRouteInputSchema.parse(input)
            if (protectedHostnames.includes(payload.hostname)) {
                throw createAppError('NGINX_ROUTE_PROTECTED_HOSTNAME')
            }
            assertProtectedTarget(payload)
            const existing = (await list()).find(
                (route) => route.hostname === payload.hostname && route.path === payload.path && route.pathMode === payload.pathMode,
            )
            const timestamp = now()
            const route = nginxProxyRouteListSchema.element.parse({
                ...payload,
                createdAt: existing?.createdAt ?? timestamp.toISOString(),
                id: existing?.id ?? randomUUID(),
                updatedAt: timestamp.toISOString(),
            })
            const routes = [...(await list()).filter((candidate) => candidate.id !== existing?.id), route]
            const result = await applyRoutes(routes)
            if (existing) {
                await db
                    .update(nginxRoute)
                    .set({ ...payload, updatedAt: timestamp })
                    .where(eq(nginxRoute.id, existing.id))
            } else {
                await db.insert(nginxRoute).values({ ...payload, createdAt: timestamp, id: route.id, updatedAt: timestamp })
            }
            return nginxProxyRouteMutationResultSchema.parse({ configSha256: result.sha256, route })
        },
    }
}

export type NginxProxyRouteService = ReturnType<typeof createNginxProxyRouteService>
