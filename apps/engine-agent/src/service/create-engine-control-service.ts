import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { lstat, realpath } from 'node:fs/promises'
import { isIPv6 } from 'node:net'
import { basename, resolve } from 'node:path'
import {
    buildCachePruneRequestSchema,
    buildCachePruneResultSchema,
    containerActionSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    containerExecResultSchema,
    containerHealthProbeRequestSchema,
    containerHealthProbeResultSchema,
    containerNetworkAttachmentSchema,
    dockerResourceRemoveRequestSchema,
    imagePullRequestSchema,
    imagePullResultSchema,
    imageRemoveRequestSchema,
    imageRemovalImpactSchema,
    imageSummaryListSchema,
    imageTagRequestSchema,
    networkCreateRequestSchema,
    networkSummaryListSchema,
    operationResultSchema,
    prunePreviewRequestSchema,
    prunePreviewSchema,
    volumeSummaryListSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import { imageLoadRequestSchema, imageLoadResultSchema } from '@containers/contracts/upload'
import type { DockerEngineClient } from '../docker/create-docker-engine-client'
import { createAppError } from '../lib/error'
import type { RegistryCredentialService } from './create-registry-credential-service'

type EngineControlServiceDependencies = {
    artifactRoot: string
    dockerEngineClient: Pick<
        DockerEngineClient,
        | 'createContainer'
        | 'createNetwork'
        | 'createVolume'
        | 'connectContainerNetwork'
        | 'disconnectContainerNetwork'
        | 'executeContainer'
        | 'getContainers'
        | 'getDiskUsage'
        | 'getImages'
        | 'getNetworks'
        | 'getVolumes'
        | 'loadImageArchive'
        | 'inspectContainer'
        | 'performContainerAction'
        | 'pullImage'
        | 'pruneBuildCache'
        | 'removeImage'
        | 'tagImage'
        | 'removeNetwork'
        | 'removeVolume'
    >
    fetcher?: (input: string, init?: RequestInit) => Promise<Response>
    registryCredentialService?: Pick<RegistryCredentialService, 'getRegistryAuth'>
    resolveHost?: (hostname: string) => Promise<{ addresses: string[] }>
}

const matchesIdentifier = (confirmation: string, id: string, names: string[]) =>
    confirmation === id || confirmation === id.slice(0, 12) || names.includes(confirmation)

const containerMatchesReference = (containerId: string, containerNames: string[], reference: string) =>
    containerId === reference || containerId.startsWith(reference) || containerNames.includes(reference)

const findContainerByReference = (containers: Array<{ Id: string; Labels: Record<string, string>; Names: string[] }>, reference: string) =>
    containers.find((candidate) =>
        containerMatchesReference(
            candidate.Id,
            candidate.Names.map((name) => name.replace(/^\//, '')),
            reference,
        ),
    )

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const MANAGEMENT_LABEL = 'managed-by'
const MANAGEMENT_LABEL_VALUE = 'containers-control-plane'
const MANAGEMENT_PROJECT = 'containers'
const PROTECTED_CONTAINER_ACTIONS = ['kill', 'pause', 'remove', 'rename', 'restart', 'start', 'stop', 'unpause', 'update']
const BUILTIN_NETWORK_NAMES = ['bridge', 'host', 'none']
const PROTECTED_VOLUME_PREFIX = 'containers_'
const PROTECTED_VOLUMES = [
    `${PROTECTED_VOLUME_PREFIX}agent-credentials`,
    `${PROTECTED_VOLUME_PREFIX}artifacts`,
    `${PROTECTED_VOLUME_PREFIX}backups`,
    `${PROTECTED_VOLUME_PREFIX}control-data`,
    `${PROTECTED_VOLUME_PREFIX}nginx-config`,
    `${PROTECTED_VOLUME_PREFIX}nginx-logs`,
    `${PROTECTED_VOLUME_PREFIX}registry-credentials`,
    `${PROTECTED_VOLUME_PREFIX}traffic-credentials`,
    `${PROTECTED_VOLUME_PREFIX}traffic-data`,
]

const isManagementPlaneResource = (labels: Record<string, string>) =>
    labels[COMPOSE_PROJECT_LABEL] === MANAGEMENT_PROJECT || labels[MANAGEMENT_LABEL] === MANAGEMENT_LABEL_VALUE

const isPrivateIpv4Octets = (octets: number[]) => {
    const first = octets[0]
    const second = octets[1]
    if (first === undefined || second === undefined) return true
    if (first === 10 || first === 127 || first === 0) return true
    if (first === 169 && second === 254) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 168) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    if (first === 198 && second >= 18 && second <= 19) return true
    if (first >= 224) return true
    return false
}

const isPrivateAddress = (address: string) => {
    const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
        const octets = ipv4.slice(1).map(Number)
        if (octets.some((octet) => octet > 255)) {
            return true
        }
        return isPrivateIpv4Octets(octets)
    }
    if (!isIPv6(address)) {
        return true
    }
    const bytes = parseIpv6Bytes(address)
    if (!bytes) {
        return true
    }
    const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff
    const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0)
    if (isIpv4Mapped || isIpv4Compatible) {
        return isPrivateIpv4Octets([bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0])
    }
    const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && (bytes[15] ?? 0) === 1
    if (isLoopback || (bytes[0] === 0xfe && (bytes[1] ?? 0) & 0xc0)) {
        return true
    }
    if ((bytes[0] ?? 0) === 0xfc || (bytes[0] ?? 0) === 0xfd) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x02) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x01 && (bytes[2] ?? 0) === 0x00 && (bytes[3] ?? 0) === 0x00) {
        return true
    }
    if ((bytes[0] ?? 0) >= 0xff) {
        return true
    }
    return false
}

const parseIpv6Bytes = (value: string): number[] | null => {
    const address = value.toLowerCase()
    const hasDoubleColon = address.includes('::')
    const parts = address.split('::')
    if (parts.length > 2) {
        return null
    }
    const [head = '', tail = ''] = parts
    const headGroups = head === '' ? [] : head.split(':')
    const tailGroups = tail === '' ? [] : tail.split(':')
    const headBytes: number[] = []
    const tailBytes: number[] = []
    const embedIpv4 = (groups: string[]) => {
        const result: number[] = []
        for (let index = 0; index < groups.length; index += 1) {
            const group = groups[index]
            if (group === undefined) {
                return null
            }
            const ipv4Embedded = group.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/)
            if (ipv4Embedded && index === groups.length - 1) {
                const octets = ipv4Embedded.slice(1).map(Number)
                if (octets.some((octet) => octet > 255)) {
                    return null
                }
                result.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0))
                continue
            }
            const parsed = Number.parseInt(group, 16)
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) {
                return null
            }
            result.push(parsed >> 8, parsed & 0xff)
        }
        return result
    }
    const headParsed = embedIpv4(headGroups)
    const tailParsed = embedIpv4(tailGroups)
    if (!headParsed || !tailParsed) {
        return null
    }
    headBytes.push(...headParsed)
    tailBytes.push(...tailParsed)
    if (!hasDoubleColon) {
        if (headBytes.length !== 16) {
            return null
        }
        return headBytes
    }
    const zeroCount = 16 - headBytes.length - tailBytes.length
    if (zeroCount < 0 || zeroCount % 2 !== 0) {
        return null
    }
    return [...headBytes, ...Array.from({ length: zeroCount }, () => 0), ...tailBytes]
}

export const createEngineControlService = ({
    artifactRoot,
    dockerEngineClient,
    fetcher = fetch,
    registryCredentialService,
    resolveHost = async (hostname: string) => {
        const entries = await lookup(hostname, { all: true, verbatim: true })
        return { addresses: entries.map((entry) => entry.address) }
    },
}: EngineControlServiceDependencies) => {
    const assertPublicRegistryReference = async (reference: string) => {
        const components = reference.split('/')
        const firstComponent = components[0]
        const hasPath = components.length > 1
        const registryHost =
            firstComponent && hasPath && (firstComponent.includes('.') || firstComponent === 'localhost' || firstComponent.includes(':'))
                ? firstComponent.replace(/:\d+$/, '')
                : undefined
        if (registryHost) {
            try {
                const { addresses } = await resolveHost(registryHost)
                if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
                    throw createAppError('REGISTRY_HOST_INTERNAL')
                }
            } catch (error) {
                if (error instanceof Error && error.message === 'REGISTRY_HOST_INTERNAL') {
                    throw error
                }
                throw createAppError('REGISTRY_RESOLVE_FAILED')
            }
        }
    }

    return {
        connectContainerNetwork: async (containerId: string, input: unknown) => {
            const request = containerNetworkAttachmentSchema.parse(input)
            if (request.network === 'host' || request.network === 'none') {
                throw createAppError('MANAGEMENT_NETWORK_PROTECTED')
            }
            const containers = await dockerEngineClient.getContainers()
            const container = findContainerByReference(containers, containerId)
            if (container && isManagementPlaneResource(container.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }
            await dockerEngineClient.connectContainerNetwork(containerId, request.network)
            return operationResultSchema.parse({ operation: 'connect-network', targetId: containerId })
        },
        createContainer: async (input: unknown) => {
            const container = containerCreateRequestSchema.parse(input)
            if (container.volumes.some((volume) => PROTECTED_VOLUMES.includes(volume.name))) {
                throw createAppError('MANAGEMENT_VOLUME_PROTECTED')
            }
            if (container.network === 'host' || container.network === 'none') {
                throw createAppError('MANAGEMENT_NETWORK_PROTECTED')
            }
            await assertPublicRegistryReference(container.image)
            const created = await dockerEngineClient.createContainer(container)
            return operationResultSchema.parse({ operation: 'create-container', targetId: created.Id })
        },
        createNetwork: async (input: unknown) => {
            const network = await dockerEngineClient.createNetwork(networkCreateRequestSchema.parse(input))
            return operationResultSchema.parse({ operation: 'create-network', targetId: network.Id })
        },
        createVolume: async (input: unknown) => {
            const volume = await dockerEngineClient.createVolume(volumeCreateRequestSchema.parse(input))
            return operationResultSchema.parse({ operation: 'create-volume', targetId: volume.Name })
        },
        disconnectContainerNetwork: async (containerId: string, input: unknown) => {
            const request = containerNetworkAttachmentSchema.parse(input)
            const containers = await dockerEngineClient.getContainers()
            const container = findContainerByReference(containers, containerId)
            if (container && isManagementPlaneResource(container.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }
            await dockerEngineClient.disconnectContainerNetwork(containerId, request.network)
            return operationResultSchema.parse({ operation: 'disconnect-network', targetId: containerId })
        },
        executeContainer: async (containerId: string, input: unknown) => {
            const containers = await dockerEngineClient.getContainers()
            const container = findContainerByReference(containers, containerId)
            if (container && isManagementPlaneResource(container.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }
            return containerExecResultSchema.parse(await dockerEngineClient.executeContainer(containerId, containerExecRequestSchema.parse(input)))
        },
        getImages: async () => {
            const images = await dockerEngineClient.getImages()

            return imageSummaryListSchema.parse(
                images.map((image) => ({
                    createdAt: new Date(image.Created * 1_000).toISOString(),
                    id: image.Id,
                    repoDigests: image.RepoDigests,
                    repoTags: image.RepoTags,
                    sharedSizeBytes: Math.max(0, image.SharedSize),
                    sizeBytes: image.Size,
                })),
            )
        },
        getImageRemovalImpact: async (imageId: string) => {
            const [images, containers] = await Promise.all([dockerEngineClient.getImages(), dockerEngineClient.getContainers()])
            const image = images.find((candidate) => candidate.Id === imageId || candidate.Id.endsWith(imageId) || candidate.Id.startsWith(imageId))
            if (!image) {
                throw createAppError('DOCKER_NOT_FOUND')
            }
            const dependentContainers = containers.filter((container) => container.ImageID === image.Id)
            return imageRemovalImpactSchema.parse({
                containers: dependentContainers.map((container) => ({
                    id: container.Id,
                    isManagementPlane: isManagementPlaneResource(container.Labels),
                    names: container.Names.map((name) => name.replace(/^\//, '')),
                    state: container.State,
                })),
                imageId: image.Id,
                isManagementPlane: dependentContainers.some((container) => isManagementPlaneResource(container.Labels)),
            })
        },
        getNetworks: async () =>
            networkSummaryListSchema.parse(
                (await dockerEngineClient.getNetworks()).map((network) => ({
                    attachable: network.Attachable,
                    containerCount: Object.keys(network.Containers).length,
                    driver: network.Driver,
                    id: network.Id,
                    ingress: network.Ingress,
                    internal: network.Internal,
                    labelKeys: Object.keys(network.Labels),
                    name: network.Name,
                    scope: network.Scope,
                    subnets: network.IPAM.Config.map((config) => ({ gateway: config.Gateway ?? '', subnet: config.Subnet ?? '' })),
                })),
            ),
        getVolumes: async () =>
            volumeSummaryListSchema.parse(
                (await dockerEngineClient.getVolumes()).map((volume) => ({
                    createdAt: volume.CreatedAt ?? null,
                    driver: volume.Driver,
                    labelKeys: Object.keys(volume.Labels),
                    name: volume.Name,
                    optionKeys: Object.keys(volume.Options),
                    refCount: volume.UsageData.RefCount,
                    scope: volume.Scope,
                    sizeBytes: Math.max(0, volume.UsageData.Size),
                })),
            ),
        getPrunePreview: async (input: unknown) => {
            const request = prunePreviewRequestSchema.parse(input)
            const [containers, images, networks, volumes, diskUsage] = await Promise.all([
                dockerEngineClient.getContainers(),
                dockerEngineClient.getImages(),
                dockerEngineClient.getNetworks(),
                dockerEngineClient.getVolumes(),
                dockerEngineClient.getDiskUsage(),
            ])
            const protectedContainers = containers.filter((container) => isManagementPlaneResource(container.Labels))
            const protectedImageIds = new Set(protectedContainers.map((container) => container.ImageID))
            const containerSizes = new Map(diskUsage.Containers.map((container) => [container.Id, container.SizeRw]))
            const imageSizes = new Map(diskUsage.Images.map((image) => [image.Id, Math.max(0, image.Size - Math.max(0, image.SharedSize))]))
            const volumeSizes = new Map(diskUsage.Volumes.map((volume) => [volume.Name, volume.UsageData?.Size ?? 0]))
            const containerCandidates = containers
                .filter((container) => container.State !== 'running' && !isManagementPlaneResource(container.Labels))
                .map((container) => ({
                    id: container.Id,
                    name: container.Names[0]?.replace(/^\//, '') ?? null,
                    reclaimableBytes: containerSizes.get(container.Id) ?? 0,
                }))
            const imageCandidates = images
                .filter(
                    (image) =>
                        image.RepoTags.length === 0 &&
                        !containers.some((container) => container.ImageID === image.Id) &&
                        !protectedImageIds.has(image.Id),
                )
                .map((image) => ({ id: image.Id, name: image.RepoDigests[0] ?? null, reclaimableBytes: imageSizes.get(image.Id) ?? 0 }))
            const networkCandidates = networks
                .filter(
                    (network) =>
                        Object.keys(network.Containers).length === 0 &&
                        !BUILTIN_NETWORK_NAMES.includes(network.Name) &&
                        !isManagementPlaneResource(network.Labels),
                )
                .map((network) => ({ id: network.Id, name: network.Name, reclaimableBytes: 0 }))
            const volumeCandidates = request.includeVolumes
                ? volumes
                      .filter((volume) => volume.UsageData.RefCount === 0 && !isManagementPlaneResource(volume.Labels))
                      .map((volume) => ({ id: volume.Name, name: volume.Name, reclaimableBytes: volumeSizes.get(volume.Name) ?? 0 }))
                : []
            const buildCacheCandidates = diskUsage.BuildCache.filter((cache) => !cache.InUse).map((cache) => ({
                id: cache.ID,
                name: null,
                reclaimableBytes: cache.Size,
            }))
            const sortedBuildCacheCandidates = buildCacheCandidates.toSorted((left, right) => left.id.localeCompare(right.id))
            const sortedContainerCandidates = containerCandidates.toSorted((left, right) => left.id.localeCompare(right.id))
            const sortedImageCandidates = imageCandidates.toSorted((left, right) => left.id.localeCompare(right.id))
            const sortedNetworkCandidates = networkCandidates.toSorted((left, right) => left.id.localeCompare(right.id))
            const sortedVolumeCandidates = volumeCandidates.toSorted((left, right) => left.id.localeCompare(right.id))
            const candidates = [
                ...sortedContainerCandidates,
                ...sortedImageCandidates,
                ...sortedNetworkCandidates,
                ...sortedVolumeCandidates,
                ...sortedBuildCacheCandidates,
            ]
            const protectedResourceCount =
                protectedContainers.length +
                images.filter((image) => protectedImageIds.has(image.Id)).length +
                networks.filter((network) => isManagementPlaneResource(network.Labels)).length +
                volumes.filter((volume) => isManagementPlaneResource(volume.Labels)).length

            return prunePreviewSchema.parse({
                buildCache: sortedBuildCacheCandidates,
                containers: sortedContainerCandidates,
                images: sortedImageCandidates,
                networks: sortedNetworkCandidates,
                protectedResourceCount,
                reclaimableBytes: candidates.reduce((total, candidate) => total + candidate.reclaimableBytes, 0),
                sha256: createHash('sha256')
                    .update(
                        JSON.stringify({
                            buildCache: sortedBuildCacheCandidates.map((candidate) => candidate.id),
                            containers: sortedContainerCandidates.map((candidate) => candidate.id),
                            images: sortedImageCandidates.map((candidate) => candidate.id),
                            includeVolumes: request.includeVolumes,
                            networks: sortedNetworkCandidates.map((candidate) => candidate.id),
                            volumes: sortedVolumeCandidates.map((candidate) => candidate.id),
                        }),
                    )
                    .digest('hex'),
                volumes: sortedVolumeCandidates,
            })
        },
        loadImage: async (input: unknown) => {
            const request = imageLoadRequestSchema.parse(input)
            const readyRoot = await realpath(resolve(artifactRoot, 'ready'))
            const requestedPath = resolve(request.artifactPath)
            const file = await lstat(requestedPath)
            const resolvedPath = await realpath(requestedPath)

            if (file.isSymbolicLink() || !file.isFile() || !resolvedPath.startsWith(`${readyRoot}/`)) {
                throw createAppError('ARTIFACT_PATH_INVALID')
            }

            const targetId = basename(resolvedPath, '.archive')
            const messages = await dockerEngineClient.loadImageArchive(resolvedPath)
            return imageLoadResultSchema.parse({ messages, operation: 'load-image', targetId })
        },
        probeContainer: async (containerId: string, input: unknown) => {
            const request = containerHealthProbeRequestSchema.parse(input)
            const container = await dockerEngineClient.inspectContainer(containerId)
            if (isManagementPlaneResource(container.Config.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }
            if (!container.State.Running) {
                return containerHealthProbeResultSchema.parse({ error: 'CONTAINER_NOT_RUNNING', healthy: false, latencyMs: 0, statusCode: 0 })
            }
            const containerName = container.Name.replace(/^\//, '')
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(containerName)) {
                throw createAppError('CONTAINER_NAME_INVALID')
            }
            const startedAt = Date.now()
            try {
                const response = await fetcher(`http://${containerName}:${request.port}${request.path}`, {
                    redirect: 'manual',
                    signal: AbortSignal.timeout(request.timeoutMs),
                })
                return containerHealthProbeResultSchema.parse({
                    error: response.ok ? null : `HTTP_${response.status}`,
                    healthy: response.ok,
                    latencyMs: Date.now() - startedAt,
                    statusCode: response.status,
                })
            } catch (error) {
                return containerHealthProbeResultSchema.parse({
                    error: error instanceof Error ? error.message.slice(0, 512) : 'PROBE_FAILED',
                    healthy: false,
                    latencyMs: Date.now() - startedAt,
                    statusCode: 0,
                })
            }
        },
        performContainerAction: async (containerId: string, input: unknown) => {
            const action = containerActionSchema.parse(input)

            if (PROTECTED_CONTAINER_ACTIONS.includes(action.action)) {
                const containers = await dockerEngineClient.getContainers()
                const container = findContainerByReference(containers, containerId)
                if (container && isManagementPlaneResource(container.Labels)) {
                    throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
                }
            }

            if (action.action === 'remove') {
                const containers = await dockerEngineClient.getContainers()
                const container = findContainerByReference(containers, containerId)
                const names = container?.Names.map((name) => name.replace(/^\//, '')) ?? []

                if (!container || !matchesIdentifier(action.confirmation, container.Id, names)) {
                    throw createAppError('CONFIRMATION_MISMATCH')
                }
            }

            await dockerEngineClient.performContainerAction(containerId, action)
            return operationResultSchema.parse({ operation: action.action, targetId: containerId })
        },
        pullImage: async (input: unknown) => {
            const request = imagePullRequestSchema.parse(input)
            const registryAuth =
                request.credentialId === undefined
                    ? undefined
                    : await registryCredentialService?.getRegistryAuth(request.credentialId, request.reference)
            if (request.credentialId !== undefined && registryAuth === undefined) throw createAppError('REGISTRY_CREDENTIAL_SERVICE_UNAVAILABLE')
            await assertPublicRegistryReference(request.reference)
            return imagePullResultSchema.parse(await dockerEngineClient.pullImage(request.reference, registryAuth))
        },
        pruneBuildCache: async (input: unknown) => {
            const request = buildCachePruneRequestSchema.parse(input)
            return buildCachePruneResultSchema.parse(await dockerEngineClient.pruneBuildCache(request.ids))
        },
        tagImage: async (imageId: string, input: unknown) => {
            const request = imageTagRequestSchema.parse(input)
            await dockerEngineClient.tagImage(imageId, request.repository, request.tag)
            return operationResultSchema.parse({ operation: 'tag-image', targetId: `${request.repository}:${request.tag}` })
        },
        removeImage: async (imageId: string, input: unknown) => {
            const request = imageRemoveRequestSchema.parse(input)
            const [images, containers] = await Promise.all([dockerEngineClient.getImages(), dockerEngineClient.getContainers()])
            const image = images.find((candidate) => candidate.Id === imageId || candidate.Id.endsWith(imageId) || candidate.Id.startsWith(imageId))
            const identifiers = image ? [...image.RepoTags, ...image.RepoDigests] : []

            if (!image || !matchesIdentifier(request.confirmation, image.Id.replace(/^sha256:/, ''), identifiers)) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }

            if (containers.some((container) => container.ImageID === image.Id && isManagementPlaneResource(container.Labels))) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }

            await dockerEngineClient.removeImage(imageId, request.force, request.pruneChildren)
            return operationResultSchema.parse({ operation: 'remove-image', targetId: imageId })
        },
        removeNetwork: async (networkId: string, input: unknown) => {
            const request = dockerResourceRemoveRequestSchema.parse(input)
            const networks = await dockerEngineClient.getNetworks()
            const network = networks.find(
                (candidate) => candidate.Id === networkId || candidate.Id.startsWith(networkId) || candidate.Name === networkId,
            )

            if (!network || !matchesIdentifier(request.confirmation, network.Id, [network.Name])) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }

            if (isManagementPlaneResource(network.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }

            await dockerEngineClient.removeNetwork(network.Id)
            return operationResultSchema.parse({ operation: 'remove-network', targetId: network.Id })
        },
        removeVolume: async (volumeName: string, input: unknown) => {
            const request = dockerResourceRemoveRequestSchema.parse(input)
            const volumes = await dockerEngineClient.getVolumes()
            const volume = volumes.find((candidate) => candidate.Name === volumeName)

            if (!volume || request.confirmation !== volume.Name) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }

            if (isManagementPlaneResource(volume.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }

            await dockerEngineClient.removeVolume(volume.Name, request.force)
            return operationResultSchema.parse({ operation: 'remove-volume', targetId: volume.Name })
        },
    }
}

export type EngineControlService = ReturnType<typeof createEngineControlService>
