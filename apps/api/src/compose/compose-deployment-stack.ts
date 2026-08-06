import { and, asc, eq, inArray } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, deploymentStack } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createDeploymentStackService, type DeploymentStackServiceDb } from '../service/domain/deployment/create-deployment-stack-service'

type ComposeDeploymentStackDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'getImages'>
    protectedHostnames: () => string[]
    protectedNetworks: string[]
}

export const buildDeploymentStackServiceDb = (db: ControlDatabase): DeploymentStackServiceDb => ({
    list: async () => db.select().from(deploymentStack).orderBy(asc(deploymentStack.createdAt)),
    findById: async (id) => {
        const [record] = await db.select().from(deploymentStack).where(eq(deploymentStack.id, id)).limit(1)
        return record
    },
    findVersionCollision: async (name, version) => {
        const [record] = await db
            .select({ id: deploymentStack.id })
            .from(deploymentStack)
            .where(and(eq(deploymentStack.name, name), eq(deploymentStack.version, version)))
            .limit(1)
        return record
    },
    findManifestIdentity: async (name) => {
        const [record] = await db
            .select({ routeHostname: deploymentManifest.routeHostname, routePath: deploymentManifest.routePath })
            .from(deploymentManifest)
            .where(eq(deploymentManifest.name, name))
            .limit(1)
        return record
    },
    findManifestVersionCollisions: async (names, version) => {
        const records = await db
            .select({ name: deploymentManifest.name })
            .from(deploymentManifest)
            .where(and(inArray(deploymentManifest.name, names), eq(deploymentManifest.version, version)))
        return records.map((record) => record.name)
    },
    insertStack: async ({ manifestRows, stack }) => {
        await db.transaction(async (transaction) => {
            await transaction.insert(deploymentManifest).values(manifestRows)
            await transaction.insert(deploymentStack).values(stack)
        })
    },
})

export const composeDeploymentStack = ({ db, engineAgentClient, protectedHostnames, protectedNetworks }: ComposeDeploymentStackDependencies) => ({
    deploymentStackService: createDeploymentStackService({
        db: buildDeploymentStackServiceDb(db),
        engineAgentClient,
        now: () => new Date(),
        protectedHostnames,
        protectedNetworks,
    }),
})
