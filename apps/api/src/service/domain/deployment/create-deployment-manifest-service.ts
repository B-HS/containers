import type { DeploymentManifest } from '@containers/contracts/deployment'
import { createHash, randomUUID } from 'node:crypto'
import {
    deploymentManifestInputSchema,
    deploymentManifestListSchema,
    deploymentManifestSchema,
    type DeploymentManifestInput,
} from '@containers/contracts/deployment'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../../lib/error'

type ManifestRow = {
    commandJson: string
    createdAt: Date
    createdBy: string
    entrypointJson: string
    environmentKeysJson: string
    healthcheckIntervalSeconds: number
    healthcheckPath: string
    healthcheckRetries: number
    healthcheckStartPeriodSeconds: number
    healthcheckTimeoutSeconds: number
    id: string
    imageDigest: string
    internalPort: number
    memoryBytes: number
    name: string
    nanoCpus: number
    network: string
    pidsLimit: number
    protocol: DeploymentManifest['protocol']
    restartPolicy: DeploymentManifest['restartPolicy']
    rolloutObservationSeconds: number
    runtimeJson: string
    rolloutRollbackRetentionSeconds: number
    routeHostname: string
    routePath: string
    routeStripPrefix: boolean
    secretsJson: string
    updatedAt: Date
    version: string
    volumesJson: string
}

type ManifestIdentity = {
    routeHostname: string
    routePath: string
}

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

const toManifest = (row: ManifestRow) =>
    deploymentManifestSchema.parse({
        command: JSON.parse(row.commandJson),
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        entrypoint: JSON.parse(row.entrypointJson),
        environmentKeys: JSON.parse(row.environmentKeysJson),
        healthcheck: {
            intervalSeconds: row.healthcheckIntervalSeconds,
            path: row.healthcheckPath,
            retries: row.healthcheckRetries,
            startPeriodSeconds: row.healthcheckStartPeriodSeconds,
            timeoutSeconds: row.healthcheckTimeoutSeconds,
        },
        id: row.id,
        imageDigest: row.imageDigest,
        internalPort: row.internalPort,
        memoryBytes: row.memoryBytes,
        name: row.name,
        nanoCpus: row.nanoCpus,
        network: row.network,
        pidsLimit: row.pidsLimit,
        protocol: row.protocol,
        restartPolicy: row.restartPolicy,
        rollout: {
            observationSeconds: row.rolloutObservationSeconds,
            rollbackRetentionSeconds: row.rolloutRollbackRetentionSeconds,
        },
        route: {
            hostname: row.routeHostname,
            path: row.routePath,
            stripPrefix: row.routeStripPrefix,
        },
        runtime: JSON.parse(row.runtimeJson),
        secrets: JSON.parse(row.secretsJson),
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
        volumes: JSON.parse(row.volumesJson),
    })

const toRow = (id: string, actorId: string, timestamp: Date, input: DeploymentManifestInput) => ({
    commandJson: JSON.stringify(input.command),
    createdAt: timestamp,
    createdBy: actorId,
    entrypointJson: JSON.stringify(input.entrypoint),
    environmentKeysJson: JSON.stringify(input.environmentKeys),
    healthcheckIntervalSeconds: input.healthcheck.intervalSeconds,
    healthcheckPath: input.healthcheck.path,
    healthcheckRetries: input.healthcheck.retries,
    healthcheckStartPeriodSeconds: input.healthcheck.startPeriodSeconds,
    healthcheckTimeoutSeconds: input.healthcheck.timeoutSeconds,
    id,
    imageDigest: input.imageDigest,
    internalPort: input.internalPort,
    memoryBytes: input.memoryBytes,
    name: input.name,
    nanoCpus: input.nanoCpus,
    network: input.network,
    pidsLimit: input.pidsLimit,
    protocol: input.protocol,
    restartPolicy: input.restartPolicy,
    rolloutObservationSeconds: input.rollout.observationSeconds,
    rolloutRollbackRetentionSeconds: input.rollout.rollbackRetentionSeconds,
    routeHostname: input.route.hostname,
    routePath: input.route.path,
    routeStripPrefix: input.route.stripPrefix,
    runtimeJson: JSON.stringify(input.runtime),
    secretsJson: JSON.stringify(input.secrets),
    updatedAt: timestamp,
    version: input.version,
    volumesJson: JSON.stringify(input.volumes),
})

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
        const manifests = deploymentManifestListSchema.parse((await db.list()).map(toManifest))
        return manifests.filter(
            (manifest) =>
                (filter.name === undefined || manifest.name === filter.name) && (filter.version === undefined || manifest.version === filter.version),
        )
    }

    return {
        create: async (actorId: string, input: unknown) => {
            const payload = deploymentManifestInputSchema.parse(input)
            if (protectedHostnames().includes(payload.route.hostname)) {
                throw createAppError('DEPLOYMENT_ROUTE_PROTECTED_HOSTNAME')
            }
            if (protectedNetworks.includes(payload.network)) {
                throw createAppError('DEPLOYMENT_NETWORK_PROTECTED')
            }
            if (['bridge', 'host', 'none'].includes(payload.network)) {
                throw createAppError('DEPLOYMENT_NETWORK_INVALID')
            }
            const existingIdentity = await db.findByIdentity(payload.name)
            if (
                existingIdentity &&
                (existingIdentity.routeHostname !== payload.route.hostname || existingIdentity.routePath !== payload.route.path)
            ) {
                throw createAppError('DEPLOYMENT_IDENTITY_MISMATCH')
            }
            const collision = await db.findVersionCollision(payload.name, payload.version)
            if (collision !== undefined) {
                const existing = await db.findById(collision.id)
                if (!existing) {
                    throw createAppError('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
                }
                const existingManifest = toManifest(existing)
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
            await db.insert(toRow(id, actorId, timestamp, payload))
            const created = await db.findById(id)
            if (!created) {
                throw createAppError('DEPLOYMENT_MANIFEST_CREATE_FAILED')
            }
            return { manifest: toManifest(created), reused: false as const }
        },
        get: async (id: string) => {
            const record = await db.findById(id)
            if (!record) {
                throw createAppError('DEPLOYMENT_MANIFEST_NOT_FOUND')
            }
            return toManifest(record)
        },
        list,
    }
}

export type DeploymentManifestService = ReturnType<typeof createDeploymentManifestService>
