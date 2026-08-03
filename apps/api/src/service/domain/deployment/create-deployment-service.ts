import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { deploymentSchema } from '@containers/contracts/upload'
import type { ControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import { createAppError } from '../../../lib/app-error'

const DEPLOYMENT_REUSE_STATUS_PRIORITY = ['loaded', 'loading', 'failed'] as const

type DeploymentServiceDependencies = {
    db: ControlDatabase
    engineAgentClient: Pick<EngineAgentClient, 'loadImage'>
    now: () => Date
}

const toDeployment = (record: { artifactId: string; createdAt: Date; id: string; status: string; updatedAt: Date }, messages: string[] = []) =>
    deploymentSchema.parse({
        artifactId: record.artifactId,
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        messages,
        status: record.status,
        updatedAt: record.updatedAt.toISOString(),
    })

export const createDeploymentService = ({ db, engineAgentClient, now }: DeploymentServiceDependencies) => {
    const getLoaded = async (artifactId: string) => {
        const [readyArtifact] = await db.select().from(artifact).where(eq(artifact.id, artifactId)).limit(1)
        if (!readyArtifact || readyArtifact.status !== 'ready') {
            throw createAppError('ARTIFACT_NOT_READY')
        }
        const [record] = await db
            .select()
            .from(deployment)
            .where(and(eq(deployment.artifactId, artifactId), eq(deployment.status, 'loaded')))
            .orderBy(desc(deployment.createdAt))
            .limit(1)
        return record ? toDeployment(record) : null
    }

    const loadArtifact = async (artifactId: string, actorId: string) => {
        const [readyArtifact] = await db.select().from(artifact).where(eq(artifact.id, artifactId)).limit(1)
        if (!readyArtifact || readyArtifact.status !== 'ready') {
            throw createAppError('ARTIFACT_NOT_READY')
        }
        const records = await db.select().from(deployment).where(eq(deployment.artifactId, artifactId)).orderBy(desc(deployment.createdAt))
        const existing = DEPLOYMENT_REUSE_STATUS_PRIORITY.reduce<(typeof records)[number] | undefined>(
            (selected, status) => selected ?? records.find((record) => record.status === status),
            undefined,
        )
        if (existing?.status === 'loaded') {
            return toDeployment(existing)
        }
        const id = existing?.id ?? randomUUID()
        const createdAt = existing?.createdAt ?? now()
        if (existing) {
            await db.update(deployment).set({ status: 'loading', updatedAt: now() }).where(eq(deployment.id, id))
        } else {
            await db.insert(deployment).values({
                artifactId,
                createdAt,
                createdBy: actorId,
                id,
                status: 'loading',
                updatedAt: createdAt,
            })
        }
        try {
            const result = await engineAgentClient.loadImage({ artifactPath: readyArtifact.storagePath })
            const updatedAt = now()
            await db.update(deployment).set({ status: 'loaded', updatedAt }).where(eq(deployment.id, id))
            return toDeployment({ artifactId, createdAt, id, status: 'loaded', updatedAt }, result.messages)
        } catch (error) {
            await db.update(deployment).set({ status: 'failed', updatedAt: now() }).where(eq(deployment.id, id))
            throw error
        }
    }

    return { getLoaded, loadArtifact }
}

export type DeploymentService = ReturnType<typeof createDeploymentService>
