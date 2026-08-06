import { and, asc, eq, inArray } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentStackRelease } from '@containers/db-schema/schema'
import {
    createDeploymentStackReleaseService,
    type DeploymentStackReleaseServiceDb,
} from '../service/domain/deployment/create-deployment-stack-release-service'
import type { DeploymentReleaseService } from '../service/domain/deployment/create-deployment-release-service'
import type { DeploymentStackService } from '../service/domain/deployment/create-deployment-stack-service'

type ComposeDeploymentStackReleaseDependencies = {
    db: ControlDatabase
    deploymentReleaseService: DeploymentReleaseService
    deploymentStackService: DeploymentStackService
}

export const buildDeploymentStackReleaseServiceDb = (db: ControlDatabase): DeploymentStackReleaseServiceDb => ({
    list: async () => db.select().from(deploymentStackRelease).orderBy(asc(deploymentStackRelease.createdAt)),
    listByStatuses: async (statuses) => db.select().from(deploymentStackRelease).where(inArray(deploymentStackRelease.status, statuses)),
    findById: async (id) => {
        const [record] = await db.select().from(deploymentStackRelease).where(eq(deploymentStackRelease.id, id)).limit(1)
        return record
    },
    findActiveByStack: async (stackId, statuses) => {
        const [record] = await db
            .select({ id: deploymentStackRelease.id })
            .from(deploymentStackRelease)
            .where(and(eq(deploymentStackRelease.stackId, stackId), inArray(deploymentStackRelease.status, statuses)))
            .limit(1)
        return record
    },
    insert: async (record) => {
        await db.insert(deploymentStackRelease).values(record)
    },
    update: async (id, values) => {
        await db.update(deploymentStackRelease).set(values).where(eq(deploymentStackRelease.id, id))
    },
})

export const composeDeploymentStackRelease = ({
    db,
    deploymentReleaseService,
    deploymentStackService,
}: ComposeDeploymentStackReleaseDependencies) => ({
    deploymentStackReleaseService: createDeploymentStackReleaseService({
        db: buildDeploymentStackReleaseServiceDb(db),
        deploymentReleaseService,
        deploymentStackService,
        now: () => new Date(),
    }),
})
