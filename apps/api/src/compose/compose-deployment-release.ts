import { and, desc, eq, inArray } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, deploymentRelease } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../agent/create-engine-agent-client'
import type { NginxProxyRouteService } from '../service/domain/nginx/create-nginx-proxy-route-service'
import type { DeploymentManifestService } from '../service/domain/deployment/create-deployment-manifest-service'
import type { DeploymentSecretService } from '../service/domain/deployment/create-deployment-secret-service'
import { createDeploymentReleaseService, type DeploymentReleaseServiceDb } from '../service/domain/deployment/create-deployment-release-service'

type ComposeDeploymentReleaseDependencies = {
    db: ControlDatabase
    probeNetwork: string
    deploymentManifestService: Pick<DeploymentManifestService, 'get'>
    deploymentSecretService: Pick<DeploymentSecretService, 'resolve'>
    engineAgentClient: Pick<
        EngineAgentClient,
        'connectContainerNetwork' | 'createContainer' | 'disconnectContainerNetwork' | 'performContainerAction' | 'probeContainer'
    >
    nginxProxyRouteService: Pick<NginxProxyRouteService, 'list' | 'remove' | 'upsert'>
    routeProbe: (input: { hostname: string; path: string; timeoutMs: number }) => Promise<boolean>
    sleep: (milliseconds: number) => Promise<void>
}

export const buildDeploymentReleaseServiceDb = (db: ControlDatabase): DeploymentReleaseServiceDb => ({
    findById: async (id) => {
        const [record] = await db.select().from(deploymentRelease).where(eq(deploymentRelease.id, id)).limit(1)
        return record
    },
    insert: async (record) => {
        await db.insert(deploymentRelease).values(record as never)
    },
    list: async () => db.select().from(deploymentRelease).orderBy(desc(deploymentRelease.createdAt)),
    listByStatuses: async (statuses) =>
        db
            .select()
            .from(deploymentRelease)
            .where(inArray(deploymentRelease.status, statuses as never)),
    findActiveByManifestName: async (manifestName, statuses) => {
        const [record] = await db
            .select({ id: deploymentRelease.id })
            .from(deploymentRelease)
            .innerJoin(deploymentManifest, eq(deploymentRelease.manifestId, deploymentManifest.id))
            .where(and(eq(deploymentManifest.name, manifestName), inArray(deploymentRelease.status, statuses as never)))
            .limit(1)
        return record
    },
    findPreviousHealthy: async (manifestName) => {
        const [record] = await db
            .select({
                containerName: deploymentRelease.containerName,
                id: deploymentRelease.id,
                manifestId: deploymentRelease.manifestId,
            })
            .from(deploymentRelease)
            .innerJoin(deploymentManifest, eq(deploymentRelease.manifestId, deploymentManifest.id))
            .where(and(eq(deploymentManifest.name, manifestName), eq(deploymentRelease.status, 'healthy')))
            .orderBy(desc(deploymentRelease.createdAt))
            .limit(1)
        return record
    },
    update: async (id, values) => {
        await db
            .update(deploymentRelease)
            .set(values as never)
            .where(eq(deploymentRelease.id, id))
    },
})

export const composeDeploymentRelease = ({
    db,
    probeNetwork,
    deploymentManifestService,
    deploymentSecretService,
    engineAgentClient,
    nginxProxyRouteService,
    routeProbe,
    sleep,
}: ComposeDeploymentReleaseDependencies) => ({
    deploymentReleaseService: createDeploymentReleaseService({
        probeNetwork,
        db: buildDeploymentReleaseServiceDb(db),
        deploymentManifestService,
        deploymentSecretService,
        engineAgentClient,
        nginxProxyRouteService,
        now: () => new Date(),
        routeProbe,
        sleep,
    }),
})
