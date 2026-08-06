import { and, desc, eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createDeploymentService, type DeploymentServiceDb } from '../service/domain/deployment/create-deployment-service'

type ComposeDeploymentDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'loadImage'>
}

type DeploymentRow = {
    artifactId: string | null
    createdAt: Date
    createdBy: string
    id: string
    status: string
    updatedAt: Date
}

const withArtifact = (record: DeploymentRow | undefined) =>
    record === undefined || record.artifactId === null ? undefined : { ...record, artifactId: record.artifactId }

export const buildDeploymentServiceDb = (db: ControlDatabase): DeploymentServiceDb => ({
    findArtifact: async (artifactId) => {
        const [record] = await db.select().from(artifact).where(eq(artifact.id, artifactId)).limit(1)
        return record
    },
    findLoadedDeployment: async (artifactId) => {
        const [record] = await db
            .select()
            .from(deployment)
            .where(and(eq(deployment.artifactId, artifactId), eq(deployment.status, 'loaded')))
            .orderBy(desc(deployment.createdAt))
            .limit(1)
        return withArtifact(record)
    },
    listDeploymentsByArtifact: async (artifactId) =>
        (await db.select().from(deployment).where(eq(deployment.artifactId, artifactId)).orderBy(desc(deployment.createdAt))).flatMap(
            (record) => withArtifact(record) ?? [],
        ),
    insert: async (record) => {
        await db.insert(deployment).values(record)
    },
    setStatus: async (id, status, updatedAt) => {
        await db.update(deployment).set({ status, updatedAt }).where(eq(deployment.id, id))
    },
})

export const composeDeployment = ({ db, engineAgentClient }: ComposeDeploymentDependencies) => ({
    deploymentService: createDeploymentService({ db: buildDeploymentServiceDb(db), engineAgentClient, now: () => new Date() }),
})
