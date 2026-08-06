import { createHash, randomUUID } from 'node:crypto'
import { deploymentManifestInputSchema, deploymentManifestListSchema } from '@containers/contracts/deployment'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../../lib/error'
import {
    assertDeploymentManifestPolicy,
    assertManifestIdentityMatches,
    toDeploymentManifest,
    toDeploymentManifestRow,
    type ManifestIdentity,
    type ManifestRow,
} from './deployment-manifest-row'

type ManifestIdRecord = {
    id: string
}

type DeploymentManifestServiceDb = {
    list: () => Promise<ManifestRow[]>
    findByIdentity: (name: string) => Promise<ManifestIdentity | undefined>
    findVersionCollision: (name: string, version: string) => Promise<ManifestIdRecord | undefined>
    findById: (id: string) => Promise<ManifestRow | undefined>
    insert: (row: Omit<ManifestRow, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: Date; id: string; updatedAt: Date }) => Promise<void>
}

type DeploymentManifestServiceDependencies = {
    db: DeploymentManifestServiceDb
    engineAgentClient: Pick<EngineAgentClient, 'getImages'>
    now: () => Date
    protectedHostnames: () => string[]
    protectedNetworks: string[]
}

export type { DeploymentManifestServiceDb }

const OMITTED_DIGEST_FIELDS = new Set(['createdAt', 'createdBy', 'id', 'updatedAt'])

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(canonicalize)
    }
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !OMITTED_DIGEST_FIELDS.has(key))
            .sort(([left], [right]) => (left < right ? -1 : 1))
        return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]))
    }
    return value
}

const payloadDigest = (value: unknown) =>
    createHash('sha256')
        .update(JSON.stringify(canonicalize(value)))
        .digest('hex')

type ManifestListFilter = {
    name?: string | undefined
    version?: string | undefined
}

export const createDeploymentManifestService = ({
    db,
    engineAgentClient,
    now,
    protectedHostnames,
    protectedNetworks,
}: DeploymentManifestServiceDependencies) => {
    const list = async (filter: ManifestListFilter = {}) => {
        const manifests = deploymentManifestListSchema.parse((await db.list()).map(toDeploymentManifest))
        return manifests.filter(
            (manifest) =>
                (filter.name === undefined || manifest.name === filter.name) && (filter.version === undefined || manifest.version === filter.version),
        )
    }

    return {
        create: async (actorId: string, input: unknown) => {
            const payload = deploymentManifestInputSchema.parse(input)
            assertDeploymentManifestPolicy(payload, { protectedHostnames: protectedHostnames(), protectedNetworks })
            assertManifestIdentityMatches(payload, await db.findByIdentity(payload.name))
            const collision = await db.findVersionCollision(payload.name, payload.version)
            if (collision !== undefined) {
                const existing = await db.findById(collision.id)
                if (!existing) {
                    throw createAppError('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
                }
                const existingManifest = toDeploymentManifest(existing)
                if (payloadDigest(existingManifest) !== payloadDigest(payload)) {
                    throw createAppError('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
                }
                return { manifest: existingManifest, reused: true as const }
            }
            const images = await engineAgentClient.getImages()
            const imageExists = images.some(
                (image) => image.id === payload.imageDigest || image.repoDigests.some((digest) => digest.endsWith(`@${payload.imageDigest}`)),
            )
            if (!imageExists) {
                throw createAppError('DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND')
            }

            const timestamp = now()
            const id = randomUUID()
            await db.insert(toDeploymentManifestRow(id, actorId, timestamp, payload))
            const created = await db.findById(id)
            if (!created) {
                throw createAppError('DEPLOYMENT_MANIFEST_CREATE_FAILED')
            }
            return { manifest: toDeploymentManifest(created), reused: false as const }
        },
        get: async (id: string) => {
            const record = await db.findById(id)
            if (!record) {
                throw createAppError('DEPLOYMENT_MANIFEST_NOT_FOUND')
            }
            return toDeploymentManifest(record)
        },
        list,
    }
}

export type DeploymentManifestService = ReturnType<typeof createDeploymentManifestService>
