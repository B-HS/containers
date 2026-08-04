import { randomUUID } from 'node:crypto'
import { deploymentSchema } from '@containers/contracts/upload'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../../lib/error'

const DEPLOYMENT_REUSE_STATUS_PRIORITY = ['loaded', 'loading', 'failed'] as const

type ArtifactRecord = {
    id: string
    status: string
    storagePath: string
}

type DeploymentRecord = {
    artifactId: string
    createdAt: Date
    id: string
    status: string
    updatedAt: Date
}

type DeploymentServiceDb = {
    findArtifact: (artifactId: string) => Promise<ArtifactRecord | undefined>
    findLoadedDeployment: (artifactId: string) => Promise<DeploymentRecord | undefined>
    listDeploymentsByArtifact: (artifactId: string) => Promise<DeploymentRecord[]>
    insert: (record: { artifactId: string; createdAt: Date; createdBy: string; id: string; status: string; updatedAt: Date }) => Promise<void>
    setStatus: (id: string, status: string, updatedAt: Date) => Promise<void>
}

type DeploymentServiceDependencies = {
    db: DeploymentServiceDb
    engineAgentClient: Pick<EngineAgentClient, 'loadImage'>
    now: () => Date
}

export type { DeploymentServiceDb }

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
        const readyArtifact = await db.findArtifact(artifactId)
        if (!readyArtifact || readyArtifact.status !== 'ready') {
            throw createAppError('ARTIFACT_NOT_READY')
        }
        const record = await db.findLoadedDeployment(artifactId)
        return record ? toDeployment(record) : null
    }

    const loadArtifact = async (artifactId: string, actorId: string) => {
        const readyArtifact = await db.findArtifact(artifactId)
        if (!readyArtifact || readyArtifact.status !== 'ready') {
            throw createAppError('ARTIFACT_NOT_READY')
        }
        const records = await db.listDeploymentsByArtifact(artifactId)
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
            await db.setStatus(id, 'loading', now())
        } else {
            await db.insert({
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
            await db.setStatus(id, 'loaded', updatedAt)
            return toDeployment({ artifactId, createdAt, id, status: 'loaded', updatedAt }, result.messages)
        } catch (error) {
            await db.setStatus(id, 'failed', now())
            throw error
        }
    }

    return { getLoaded, loadArtifact }
}

export type DeploymentService = ReturnType<typeof createDeploymentService>
