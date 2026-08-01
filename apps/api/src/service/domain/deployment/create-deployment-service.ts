import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { deploymentSchema } from '@containers/contracts/upload'
import type { ControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'

type DeploymentServiceDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'loadImage'>
    now: () => Date
}

export const createDeploymentService = ({ db, engineAgentClient, now }: DeploymentServiceDependencies) => ({
    loadArtifact: async (actorId: string, artifactId: string) => {
        const [readyArtifact] = await db.select().from(artifact).where(eq(artifact.id, artifactId)).limit(1)

        if (!readyArtifact || readyArtifact.status !== 'ready') {
            throw new Error('ARTIFACT_NOT_READY')
        }

        const id = randomUUID()
        const createdAt = now()
        await db.insert(deployment).values({
            artifactId,
            createdAt,
            createdBy: actorId,
            id,
            status: 'loading',
            updatedAt: createdAt,
        })

        try {
            const result = await engineAgentClient.loadImage({ artifactPath: readyArtifact.storagePath })
            const updatedAt = now()
            await db.update(deployment).set({ status: 'loaded', updatedAt }).where(eq(deployment.id, id))

            return deploymentSchema.parse({
                artifactId,
                createdAt: createdAt.toISOString(),
                id,
                messages: result.messages,
                status: 'loaded',
                updatedAt: updatedAt.toISOString(),
            })
        } catch (error) {
            await db.update(deployment).set({ status: 'failed', updatedAt: now() }).where(eq(deployment.id, id))
            throw error
        }
    },
})

export type DeploymentService = ReturnType<typeof createDeploymentService>
