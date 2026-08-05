import { and, asc, eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createDeploymentManifestService, type DeploymentManifestServiceDb } from '../service/domain/deployment/create-deployment-manifest-service'

type ComposeDeploymentManifestDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'getImages'>
    protectedHostnames: () => string[]
    protectedNetworks: string[]
}

export const buildDeploymentManifestServiceDb = (db: ControlDatabase): DeploymentManifestServiceDb => ({
    list: async () => db.select().from(deploymentManifest).orderBy(asc(deploymentManifest.createdAt)),
    findByIdentity: async (name) => {
        const [record] = await db
            .select({ routeHostname: deploymentManifest.routeHostname, routePath: deploymentManifest.routePath })
            .from(deploymentManifest)
            .where(eq(deploymentManifest.name, name))
            .limit(1)
        return record
    },
    findVersionCollision: async (name, version) => {
        const [record] = await db
            .select({ id: deploymentManifest.id })
            .from(deploymentManifest)
            .where(and(eq(deploymentManifest.name, name), eq(deploymentManifest.version, version)))
            .limit(1)
        return record
    },
    findById: async (id) => {
        const [record] = await db.select().from(deploymentManifest).where(eq(deploymentManifest.id, id)).limit(1)
        return record
    },
    insert: async (row) => {
        await db.insert(deploymentManifest).values(row)
    },
})

export const composeDeploymentManifest = ({
    db,
    engineAgentClient,
    protectedHostnames,
    protectedNetworks,
}: ComposeDeploymentManifestDependencies) => ({
    deploymentManifestService: createDeploymentManifestService({
        db: buildDeploymentManifestServiceDb(db),
        engineAgentClient,
        now: () => new Date(),
        protectedHostnames,
        protectedNetworks,
    }),
})
