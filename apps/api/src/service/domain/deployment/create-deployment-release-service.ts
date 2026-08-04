import { randomUUID } from 'node:crypto'
import { deploymentReleaseListSchema, deploymentReleaseSchema, type DeploymentManifest } from '@containers/contracts/deployment'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import { createAppError } from '../../../lib/error'
import type { NginxProxyRouteService } from '../nginx/create-nginx-proxy-route-service'
import type { DeploymentManifestService } from './create-deployment-manifest-service'
import type { DeploymentSecretService } from './create-deployment-secret-service'

const ACTIVE_RELEASE_STATUSES = ['creating', 'probing', 'switching', 'observing', 'rolling-back'] as const

type ReleaseRow = {
    activatedAt: Date | null
    containerId: string | null
    containerName: string
    createdAt: Date
    createdBy: string
    failureCode: string | null
    finishedAt: Date | null
    id: string
    manifestId: string
    nginxConfigSha256: string | null
    nginxRouteId: string | null
    previousReleaseId: string | null
    status: string
    updatedAt: Date
}

type ReleaseUpdateValues = Partial<{
    activatedAt: Date
    containerId: string | null
    failureCode: string | null
    finishedAt: Date
    nginxConfigSha256: string
    nginxRouteId: string
    previousReleaseId: string
    status: string
    updatedAt: Date
}>

type ReleaseIdRecord = {
    id: string
}

type PreviousReleaseRecord = {
    containerName: string
    id: string
    manifestId: string
}

type DeploymentReleaseServiceDb = {
    findById: (id: string) => Promise<ReleaseRow | undefined>
    insert: (record: {
        containerName: string
        createdAt: Date
        createdBy: string
        id: string
        manifestId: string
        previousReleaseId: string | null
        status: string
        updatedAt: Date
    }) => Promise<void>
    list: () => Promise<ReleaseRow[]>
    listByStatuses: (statuses: string[]) => Promise<ReleaseRow[]>
    findActiveByManifestName: (manifestName: string, statuses: string[]) => Promise<ReleaseIdRecord | undefined>
    findPreviousHealthy: (manifestName: string) => Promise<PreviousReleaseRecord | undefined>
    update: (id: string, values: ReleaseUpdateValues) => Promise<void>
}

type DeploymentReleaseServiceDependencies = {
    probeNetwork: string
    db: DeploymentReleaseServiceDb
    deploymentManifestService: Pick<DeploymentManifestService, 'get'>
    deploymentSecretService: Pick<DeploymentSecretService, 'resolve'>
    engineAgentClient: Pick<
        EngineAgentClient,
        'connectContainerNetwork' | 'createContainer' | 'disconnectContainerNetwork' | 'performContainerAction' | 'probeContainer'
    >
    nginxProxyRouteService: Pick<NginxProxyRouteService, 'list' | 'remove' | 'upsert'>
    now: () => Date
    routeProbe: (input: { hostname: string; path: string; timeoutMs: number }) => Promise<boolean>
    sleep: (milliseconds: number) => Promise<void>
}

export type { DeploymentReleaseServiceDb }

const toRelease = (record: ReleaseRow) =>
    deploymentReleaseSchema.parse({
        ...record,
        activatedAt: record.activatedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        finishedAt: record.finishedAt?.toISOString() ?? null,
        updatedAt: record.updatedAt.toISOString(),
    })

const routeInput = (manifest: DeploymentManifest, targetContainer: string) => ({
    bodySizeMegabytes: 64,
    enabled: true,
    hostname: manifest.route.hostname,
    path: manifest.route.path,
    pathMode: 'prefix' as const,
    protocol: manifest.protocol,
    stripPrefix: manifest.route.stripPrefix,
    targetContainer,
    targetPort: manifest.internalPort,
    timeoutSeconds: 60,
})

const publicHealthPath = (manifest: DeploymentManifest) =>
    manifest.route.path === '/'
        ? manifest.healthcheck.path
        : `${manifest.route.path.replace(/\/$/, '')}${manifest.healthcheck.path === '/' ? '' : manifest.healthcheck.path}`

export const createDeploymentReleaseService = ({
    probeNetwork,
    db,
    deploymentManifestService,
    deploymentSecretService,
    engineAgentClient,
    nginxProxyRouteService,
    now,
    routeProbe,
    sleep,
}: DeploymentReleaseServiceDependencies) => {
    const get = async (id: string) => {
        const record = await db.findById(id)
        if (!record) {
            throw createAppError('DEPLOYMENT_RELEASE_NOT_FOUND')
        }
        return toRelease(record)
    }
    const update = async (id: string, values: Omit<ReleaseUpdateValues, 'updatedAt'>) => {
        await db.update(id, { ...values, updatedAt: now() })
        return get(id)
    }
    const prepareRollback = async (id: string) => {
        const release = await get(id)
        if (release.status !== 'healthy' || !release.previousReleaseId) {
            throw createAppError('DEPLOYMENT_ROLLBACK_UNAVAILABLE')
        }
        const [target, manifest] = await Promise.all([get(release.previousReleaseId), deploymentManifestService.get(release.manifestId)])
        if (target.status !== 'healthy' || !target.containerId) {
            throw createAppError('DEPLOYMENT_ROLLBACK_TARGET_UNAVAILABLE')
        }
        const active = await db.findActiveByManifestName(manifest.name, [...ACTIVE_RELEASE_STATUSES])
        if (active) {
            throw createAppError('DEPLOYMENT_RELEASE_IN_PROGRESS')
        }
        return update(id, { failureCode: null, status: 'rolling-back' })
    }
    const runRollback = async (id: string) => {
        const release = await get(id)
        if (release.status !== 'rolling-back' || !release.previousReleaseId || !release.containerId) {
            throw createAppError('DEPLOYMENT_RELEASE_STATE_INVALID')
        }
        const target = await get(release.previousReleaseId)
        if (target.status !== 'healthy' || !target.containerId) {
            return update(id, { failureCode: 'MANUAL_ROLLBACK_FAILED:TARGET_UNAVAILABLE', status: 'healthy' })
        }
        const [manifest, targetManifest] = await Promise.all([
            deploymentManifestService.get(release.manifestId),
            deploymentManifestService.get(target.manifestId),
        ])
        let targetStarted = false
        let routeSwitched = false

        try {
            await engineAgentClient.connectContainerNetwork(target.containerId, { network: probeNetwork })
            await engineAgentClient.performContainerAction(target.containerId, { action: 'start' })
            targetStarted = true
            let healthy = false
            for (let attempt = 0; attempt < targetManifest.healthcheck.retries; attempt += 1) {
                const result = await engineAgentClient.probeContainer(target.containerId, {
                    path: targetManifest.healthcheck.path,
                    port: targetManifest.internalPort,
                    timeoutMs: targetManifest.healthcheck.timeoutSeconds * 1_000,
                })
                if (result.healthy) {
                    healthy = true
                    break
                }
                if (attempt + 1 < targetManifest.healthcheck.retries) {
                    await sleep(targetManifest.healthcheck.intervalSeconds * 1_000)
                }
            }
            if (!healthy) {
                throw createAppError('DEPLOYMENT_ROLLBACK_HEALTHCHECK_FAILED')
            }
            await nginxProxyRouteService.upsert(routeInput(targetManifest, target.containerName))
            routeSwitched = true
            let routeReady = false
            for (let attempt = 0; attempt < targetManifest.healthcheck.retries; attempt += 1) {
                routeReady = await routeProbe({
                    hostname: targetManifest.route.hostname,
                    path: publicHealthPath(targetManifest),
                    timeoutMs: targetManifest.healthcheck.timeoutSeconds * 1_000,
                })
                if (routeReady) {
                    break
                }
                if (attempt + 1 < targetManifest.healthcheck.retries) {
                    await sleep(targetManifest.healthcheck.intervalSeconds * 1_000)
                }
            }
            if (!routeReady) {
                throw createAppError('DEPLOYMENT_ROLLBACK_ROUTE_PROBE_FAILED')
            }
            await engineAgentClient.disconnectContainerNetwork(target.containerId, { network: probeNetwork })
            const rolledBack = await update(id, { failureCode: 'MANUAL_ROLLBACK', finishedAt: now(), status: 'rolled-back' })
            await engineAgentClient
                .performContainerAction(release.containerId, { action: 'stop', timeoutSeconds: 10 })
                .catch(() => update(id, { failureCode: 'MANUAL_ROLLBACK:CURRENT_CONTAINER_STOP_WARNING' }))
            return rolledBack
        } catch (error) {
            const failureCode = error instanceof Error ? error.message.slice(0, 480) : 'UNKNOWN'
            if (routeSwitched) {
                await nginxProxyRouteService.upsert(routeInput(manifest, release.containerName)).catch(() => undefined)
            }
            if (targetStarted) {
                await engineAgentClient.performContainerAction(target.containerId, { action: 'stop', timeoutSeconds: 10 }).catch(() => undefined)
            }
            await engineAgentClient.disconnectContainerNetwork(target.containerId, { network: probeNetwork }).catch(() => undefined)
            return update(id, { failureCode: `MANUAL_ROLLBACK_FAILED:${failureCode}`, status: 'healthy' })
        }
    }
    const reconcileInterrupted = async () => {
        const interrupted = deploymentReleaseListSchema.parse((await db.listByStatuses([...ACTIVE_RELEASE_STATUSES])).map(toRelease))
        const reconciled = []
        for (const release of interrupted) {
            const manifest = await deploymentManifestService.get(release.manifestId)
            if (release.status === 'rolling-back') {
                try {
                    await nginxProxyRouteService.upsert(routeInput(manifest, release.containerName))
                    if (release.previousReleaseId) {
                        const target = await get(release.previousReleaseId)
                        if (target.containerId) {
                            await engineAgentClient
                                .performContainerAction(target.containerId, { action: 'stop', timeoutSeconds: 10 })
                                .catch(() => undefined)
                            await engineAgentClient.disconnectContainerNetwork(target.containerId, { network: probeNetwork }).catch(() => undefined)
                        }
                    }
                    reconciled.push(
                        await update(release.id, {
                            failureCode: 'MANUAL_ROLLBACK_FAILED:PROCESS_INTERRUPTED',
                            status: 'healthy',
                        }),
                    )
                } catch {
                    reconciled.push(
                        await update(release.id, {
                            failureCode: 'MANUAL_ROLLBACK_RECOVERY_FAILED:PROCESS_INTERRUPTED',
                            finishedAt: now(),
                            status: 'failed',
                        }),
                    )
                }
                continue
            }
            if (release.status === 'switching' || release.status === 'observing') {
                let routeRestored: boolean
                try {
                    if (release.previousReleaseId) {
                        const previous = await get(release.previousReleaseId)
                        const previousManifest = await deploymentManifestService.get(previous.manifestId)
                        await nginxProxyRouteService.upsert(routeInput(previousManifest, previous.containerName))
                    } else {
                        const route = (await nginxProxyRouteService.list()).find(
                            (candidate) => candidate.hostname === manifest.route.hostname && candidate.path === manifest.route.path,
                        )
                        if (route) {
                            await nginxProxyRouteService.remove(route.id, `${manifest.route.hostname}${manifest.route.path}`)
                        }
                    }
                    routeRestored = true
                } catch {
                    routeRestored = false
                }
                if (release.containerId) {
                    await engineAgentClient.performContainerAction(release.containerId, { action: 'stop', timeoutSeconds: 10 }).catch(() => undefined)
                }
                reconciled.push(
                    await update(release.id, {
                        failureCode: routeRestored ? 'DEPLOYMENT_PROCESS_INTERRUPTED' : 'DEPLOYMENT_RECOVERY_FAILED:PROCESS_INTERRUPTED',
                        finishedAt: now(),
                        status: routeRestored ? 'rolled-back' : 'failed',
                    }),
                )
                continue
            }
            if (release.containerId) {
                await engineAgentClient.performContainerAction(release.containerId, { action: 'stop', timeoutSeconds: 10 }).catch(() => undefined)
                await engineAgentClient.disconnectContainerNetwork(release.containerId, { network: probeNetwork }).catch(() => undefined)
            }
            reconciled.push(
                await update(release.id, {
                    failureCode: 'DEPLOYMENT_PROCESS_INTERRUPTED',
                    finishedAt: now(),
                    status: 'failed',
                }),
            )
        }
        return deploymentReleaseListSchema.parse(reconciled)
    }
    const cleanupExpiredContainers = async () => {
        const healthyReleases = deploymentReleaseListSchema.parse((await db.listByStatuses(['healthy'])).map(toRelease))
        let removed = 0
        for (const release of healthyReleases) {
            if (!release.previousReleaseId || !release.activatedAt) {
                continue
            }
            const manifest = await deploymentManifestService.get(release.manifestId)
            const expiresAt = new Date(release.activatedAt).getTime() + manifest.rollout.rollbackRetentionSeconds * 1_000
            if (now().getTime() < expiresAt) {
                continue
            }
            const previous = await get(release.previousReleaseId)
            if (!previous.containerId) {
                continue
            }
            try {
                await engineAgentClient.performContainerAction(previous.containerId, {
                    action: 'remove',
                    confirmation: previous.containerName,
                    force: true,
                    removeVolumes: false,
                })
                await update(previous.id, { containerId: null })
                removed += 1
            } catch {
                continue
            }
        }
        return removed
    }

    return {
        cleanupExpiredContainers,
        create: async (actorId: string, manifestId: string) => {
            const manifest = await deploymentManifestService.get(manifestId)
            if (manifest.environmentKeys.length > 0) {
                throw createAppError('DEPLOYMENT_CONFIGURATION_UNRESOLVED')
            }
            await deploymentSecretService.resolve(manifest.secrets)
            const active = await db.findActiveByManifestName(manifest.name, [...ACTIVE_RELEASE_STATUSES])
            if (active) {
                throw createAppError('DEPLOYMENT_RELEASE_IN_PROGRESS')
            }
            const previous = await db.findPreviousHealthy(manifest.name)
            const id = randomUUID()
            const timestamp = now()
            const versionSlug = manifest.version.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
            const containerName = `${manifest.name}-${versionSlug}-${id.slice(0, 8)}`.slice(0, 128)
            await db.insert({
                containerName,
                createdAt: timestamp,
                createdBy: actorId,
                id,
                manifestId,
                previousReleaseId: previous?.id ?? null,
                status: 'creating',
                updatedAt: timestamp,
            })
            return get(id)
        },
        get,
        list: async () => deploymentReleaseListSchema.parse((await db.list()).map(toRelease)),
        prepareRollback,
        reconcileInterrupted,
        run: async (id: string) => {
            const release = await get(id)
            if (release.status !== 'creating') {
                throw createAppError('DEPLOYMENT_RELEASE_STATE_INVALID')
            }
            const manifest = await deploymentManifestService.get(release.manifestId)
            const environment = await deploymentSecretService.resolve(manifest.secrets)
            const previous = release.previousReleaseId ? await get(release.previousReleaseId) : undefined
            const previousManifest = previous ? await deploymentManifestService.get(previous.manifestId) : undefined
            let containerId: string | undefined
            let switchedRoute: { id: string } | undefined

            try {
                const created = await engineAgentClient.createContainer({
                    autoStart: true,
                    command: manifest.command,
                    containerPort: manifest.internalPort,
                    entrypoint: manifest.entrypoint,
                    environment,
                    image: manifest.imageDigest,
                    labels: {
                        'containers.managed': 'true',
                        'containers.manifest-id': manifest.id,
                        'containers.release-id': release.id,
                    },
                    memoryBytes: manifest.memoryBytes,
                    name: release.containerName,
                    nanoCpus: manifest.nanoCpus,
                    network: probeNetwork,
                    pidsLimit: manifest.pidsLimit,
                    readOnlyRootFilesystem: true,
                    restartPolicy: manifest.restartPolicy,
                    volumes: manifest.volumes,
                })
                containerId = created.targetId
                await update(id, { containerId, status: 'probing' })
                if (manifest.healthcheck.startPeriodSeconds > 0) {
                    await sleep(manifest.healthcheck.startPeriodSeconds * 1_000)
                }
                let healthy = false
                for (let attempt = 0; attempt < manifest.healthcheck.retries; attempt += 1) {
                    const result = await engineAgentClient.probeContainer(containerId, {
                        path: manifest.healthcheck.path,
                        port: manifest.internalPort,
                        timeoutMs: manifest.healthcheck.timeoutSeconds * 1_000,
                    })
                    if (result.healthy) {
                        healthy = true
                        break
                    }
                    if (attempt + 1 < manifest.healthcheck.retries) {
                        await sleep(manifest.healthcheck.intervalSeconds * 1_000)
                    }
                }
                if (!healthy) {
                    throw createAppError('DEPLOYMENT_HEALTHCHECK_FAILED')
                }

                await engineAgentClient.connectContainerNetwork(containerId, { network: manifest.network })
                await engineAgentClient.disconnectContainerNetwork(containerId, { network: probeNetwork })
                await update(id, { status: 'switching' })
                const switched = await nginxProxyRouteService.upsert(routeInput(manifest, release.containerName))
                switchedRoute = { id: switched.route.id }
                await update(id, { nginxConfigSha256: switched.configSha256, nginxRouteId: switched.route.id, status: 'observing' })
                let routeReady = false
                for (let attempt = 0; attempt < manifest.healthcheck.retries; attempt += 1) {
                    routeReady = await routeProbe({
                        hostname: manifest.route.hostname,
                        path: publicHealthPath(manifest),
                        timeoutMs: manifest.healthcheck.timeoutSeconds * 1_000,
                    })
                    if (routeReady) {
                        break
                    }
                    if (attempt + 1 < manifest.healthcheck.retries) {
                        await sleep(manifest.healthcheck.intervalSeconds * 1_000)
                    }
                }
                if (!routeReady) {
                    throw createAppError('DEPLOYMENT_ROUTE_PROBE_FAILED')
                }
                await sleep(manifest.rollout.observationSeconds * 1_000)
                const finalProbe = await routeProbe({
                    hostname: manifest.route.hostname,
                    path: publicHealthPath(manifest),
                    timeoutMs: manifest.healthcheck.timeoutSeconds * 1_000,
                })
                if (!finalProbe) {
                    throw createAppError('DEPLOYMENT_OBSERVATION_FAILED')
                }
                const healthyRelease = await update(id, { activatedAt: now(), finishedAt: now(), status: 'healthy' })
                if (previous?.containerId) {
                    await engineAgentClient
                        .performContainerAction(previous.containerId, { action: 'stop', timeoutSeconds: 10 })
                        .catch(() => update(id, { failureCode: 'PREVIOUS_CONTAINER_STOP_WARNING' }))
                }
                return healthyRelease
            } catch (error) {
                const failureCode = error instanceof Error ? error.message.slice(0, 512) : 'DEPLOYMENT_RELEASE_FAILED'
                let rollbackSucceeded = false
                if (switchedRoute) {
                    try {
                        if (previous && previousManifest) {
                            await nginxProxyRouteService.upsert(routeInput(previousManifest, previous.containerName))
                        } else {
                            await nginxProxyRouteService.remove(switchedRoute.id, `${manifest.route.hostname}${manifest.route.path}`)
                        }
                        rollbackSucceeded = true
                    } catch {
                        rollbackSucceeded = false
                    }
                }
                if (containerId) {
                    await engineAgentClient.performContainerAction(containerId, { action: 'stop', timeoutSeconds: 10 }).catch(() => undefined)
                    await engineAgentClient.disconnectContainerNetwork(containerId, { network: probeNetwork }).catch(() => undefined)
                }
                return update(id, {
                    failureCode: rollbackSucceeded || !switchedRoute ? failureCode : `ROLLBACK_FAILED:${failureCode}`,
                    finishedAt: now(),
                    status: switchedRoute && rollbackSucceeded ? 'rolled-back' : 'failed',
                })
            }
        },
        runRollback,
    }
}

export type DeploymentReleaseService = ReturnType<typeof createDeploymentReleaseService>
