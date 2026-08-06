import { deploymentManifestSchema, type DeploymentManifest, type DeploymentManifestInput } from '@containers/contracts/deployment'
import { createAppError } from '../../../lib/error'

const RESERVED_NETWORKS = ['bridge', 'host', 'none']

export type ManifestRow = {
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
    routeHostname: string | null
    routePath: string | null
    routeStripPrefix: boolean | null
    secretsJson: string
    updatedAt: Date
    version: string
    volumesJson: string
}

export type ManifestIdentity = {
    routeHostname: string | null
    routePath: string | null
}

type ManifestPolicy = {
    protectedHostnames: string[]
    protectedNetworks: string[]
}

export const toDeploymentManifest = (row: ManifestRow) =>
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
        route:
            row.routeHostname === null
                ? null
                : {
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

export const toDeploymentManifestRow = (id: string, actorId: string, timestamp: Date, input: DeploymentManifestInput) => ({
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
    routeHostname: input.route?.hostname ?? null,
    routePath: input.route?.path ?? null,
    routeStripPrefix: input.route?.stripPrefix ?? null,
    runtimeJson: JSON.stringify(input.runtime),
    secretsJson: JSON.stringify(input.secrets),
    updatedAt: timestamp,
    version: input.version,
    volumesJson: JSON.stringify(input.volumes),
})

export const assertDeploymentManifestPolicy = (input: DeploymentManifestInput, { protectedHostnames, protectedNetworks }: ManifestPolicy) => {
    if (input.route !== null && protectedHostnames.includes(input.route.hostname)) {
        throw createAppError('DEPLOYMENT_ROUTE_PROTECTED_HOSTNAME', undefined, { hostname: input.route.hostname, name: input.name })
    }
    if (protectedNetworks.includes(input.network)) {
        throw createAppError('DEPLOYMENT_NETWORK_PROTECTED', undefined, { name: input.name, network: input.network })
    }
    if (RESERVED_NETWORKS.includes(input.network)) {
        throw createAppError('DEPLOYMENT_NETWORK_INVALID', undefined, { name: input.name, network: input.network })
    }
}

export const assertManifestIdentityMatches = (input: DeploymentManifestInput, identity: ManifestIdentity | undefined) => {
    if (identity === undefined) return
    if (identity.routeHostname !== (input.route?.hostname ?? null) || identity.routePath !== (input.route?.path ?? null)) {
        throw createAppError('DEPLOYMENT_IDENTITY_MISMATCH', undefined, { name: input.name })
    }
}
