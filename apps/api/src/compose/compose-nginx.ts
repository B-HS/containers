import { and, asc, eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { nginxRoute } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createNginxProxyRouteService, type NginxProxyRouteServiceDb } from '../service/domain/nginx/create-nginx-proxy-route-service'

type ComposeNginxProxyRouteDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'applyNginxConfig' | 'getNginxConfig'>
    protectedContainers: string[]
    protectedHostnames: string[]
}

export const buildNginxProxyRouteServiceDb = (db: ControlDatabase): NginxProxyRouteServiceDb => ({
    list: async () => db.select().from(nginxRoute).orderBy(asc(nginxRoute.hostname), asc(nginxRoute.path)),
    findCollision: async (hostname, path, pathMode) => {
        const [record] = await db
            .select({ id: nginxRoute.id })
            .from(nginxRoute)
            .where(and(eq(nginxRoute.hostname, hostname), eq(nginxRoute.path, path), eq(nginxRoute.pathMode, pathMode as 'exact' | 'prefix')))
            .limit(1)
        return record
    },
    insert: async (record) => {
        await db.insert(nginxRoute).values(record as never)
    },
    update: async (id, record) => {
        await db
            .update(nginxRoute)
            .set(record as never)
            .where(eq(nginxRoute.id, id))
    },
    delete: async (id) => {
        await db.delete(nginxRoute).where(eq(nginxRoute.id, id))
    },
})

export const composeNginxProxyRoute = ({ db, engineAgentClient, protectedContainers, protectedHostnames }: ComposeNginxProxyRouteDependencies) => ({
    nginxProxyRouteService: createNginxProxyRouteService({
        db: buildNginxProxyRouteServiceDb(db),
        engineAgentClient,
        now: () => new Date(),
        protectedContainers,
        protectedHostnames,
    }),
})
