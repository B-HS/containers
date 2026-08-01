import {
    containerDetailSchema,
    containerLogRequestSchema,
    containerLogResultSchema,
    containerSummaryListSchema,
    engineOverviewSchema,
} from '@containers/contracts/engine'
import {
    containerChangeListSchema,
    containerTopResultSchema,
    containerWaitRequestSchema,
    containerWaitResultSchema,
} from '@containers/contracts/engine-control'
import type { DockerEngineClient } from '../docker/create-docker-engine-client'

type FilesystemUsage = {
    availableBytes: number
    capacityBytes: number
    usedBytes: number
}

type EngineQueryServiceDependencies = {
    dockerEngineClient: Pick<
        DockerEngineClient,
        | 'changesContainer'
        | 'getContainerLogs'
        | 'getContainers'
        | 'getDiskUsage'
        | 'getInfo'
        | 'getVersion'
        | 'inspectContainer'
        | 'topContainer'
        | 'waitContainer'
    >
    getFilesystemUsage: () => Promise<FilesystemUsage>
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export const createEngineQueryService = ({ dockerEngineClient, getFilesystemUsage }: EngineQueryServiceDependencies) => ({
    getContainer: async (containerId: string) => {
        const container = await dockerEngineClient.inspectContainer(containerId)
        return containerDetailSchema.parse({
            args: container.Args,
            command: [container.Path, ...container.Args].filter((part) => part.length > 0),
            createdAt: new Date(container.Created).toISOString(),
            entrypoint: container.Config.Entrypoint,
            environmentKeys: container.Config.Env.map((entry) => entry.split('=', 1)[0] ?? '').filter((key) => key.length > 0),
            exposedPorts: Object.keys(container.Config.ExposedPorts),
            hostname: container.Config.Hostname,
            id: container.Id,
            image: container.Image,
            labelKeys: Object.keys(container.Config.Labels),
            mounts: container.Mounts.map((mount) => ({
                destination: mount.Destination,
                mode: mount.Mode,
                name: mount.Name ?? null,
                readWrite: mount.RW,
                type: mount.Type,
            })),
            name: container.Name.replace(/^\//, ''),
            networks: Object.entries(container.NetworkSettings.Networks).map(([name, network]) => ({
                gateway: network.Gateway,
                ipAddress: network.IPAddress,
                macAddress: network.MacAddress,
                name,
            })),
            platform: container.Platform,
            restartCount: container.RestartCount,
            state: {
                error: container.State.Error,
                exitCode: container.State.ExitCode,
                finishedAt: container.State.FinishedAt,
                health: container.State.Health?.Status ?? null,
                paused: container.State.Paused,
                pid: container.State.Pid,
                restarting: container.State.Restarting,
                running: container.State.Running,
                startedAt: container.State.StartedAt,
                status: container.State.Status,
            },
            user: container.Config.User,
            workingDirectory: container.Config.WorkingDir,
        })
    },
    getContainerChanges: async (containerId: string) => containerChangeListSchema.parse(await dockerEngineClient.changesContainer(containerId)),
    getContainerTop: async (containerId: string) => containerTopResultSchema.parse(await dockerEngineClient.topContainer(containerId)),
    waitContainer: async (containerId: string, input: unknown) => {
        const request = containerWaitRequestSchema.parse(input)
        return containerWaitResultSchema.parse(await dockerEngineClient.waitContainer(containerId, request.timeoutMs))
    },
    getContainerLogs: async (containerId: string, input: unknown) => {
        const request = containerLogRequestSchema.parse(input)
        return containerLogResultSchema.parse(
            await dockerEngineClient.getContainerLogs(
                containerId,
                request.tail,
                request.since ? Math.floor(new Date(request.since).getTime() / 1_000) : undefined,
            ),
        )
    },
    getContainers: async () => {
        const containers = await dockerEngineClient.getContainers()

        return containerSummaryListSchema.parse(
            containers.map((container) => ({
                command: container.Command,
                createdAt: new Date(container.Created * 1_000).toISOString(),
                id: container.Id,
                image: container.Image,
                imageId: container.ImageID,
                labelKeys: Object.keys(container.Labels),
                names: container.Names.map((name) => name.replace(/^\//, '')),
                state: container.State,
                status: container.Status,
            })),
        )
    },
    getOverview: async () => {
        const [version, info, diskUsage, filesystem] = await Promise.all([
            dockerEngineClient.getVersion(),
            dockerEngineClient.getInfo(),
            dockerEngineClient.getDiskUsage(),
            getFilesystemUsage(),
        ])
        const buildCacheBytes = sum(diskUsage.BuildCache.map((cache) => cache.Size))
        const containerWritableBytes = sum(diskUsage.Containers.map((container) => container.SizeRw))
        const localVolumeBytes = sum(diskUsage.Volumes.map((volume) => volume.UsageData?.Size ?? 0))
        const reclaimableBuildCacheBytes = sum(diskUsage.BuildCache.filter((cache) => !cache.InUse).map((cache) => cache.Size))
        const reclaimableContainerBytes = sum(
            diskUsage.Containers.filter((container) => container.State !== 'running').map((container) => container.SizeRw),
        )
        const reclaimableImageBytes = sum(
            diskUsage.Images.filter((image) => image.Containers === 0).map((image) => Math.max(0, image.Size - Math.max(0, image.SharedSize))),
        )
        const reclaimableVolumeBytes = sum(
            diskUsage.Volumes.filter((volume) => volume.UsageData?.RefCount === 0).map((volume) => volume.UsageData?.Size ?? 0),
        )

        return engineOverviewSchema.parse({
            architecture: version.Arch,
            apiVersion: version.ApiVersion,
            containers: {
                paused: info.ContainersPaused,
                running: info.ContainersRunning,
                stopped: info.ContainersStopped,
                total: info.Containers,
            },
            cpus: info.NCPU,
            disk: {
                ...filesystem,
                buildCacheBytes,
                containerWritableBytes,
                estimatedReclaimableBytes: reclaimableBuildCacheBytes + reclaimableContainerBytes + reclaimableImageBytes + reclaimableVolumeBytes,
                layersBytes: diskUsage.LayersSize,
                localVolumeBytes,
            },
            engineId: info.ID,
            engineName: info.Name,
            images: info.Images,
            memoryBytes: info.MemTotal,
            minApiVersion: version.MinAPIVersion,
            operatingSystem: info.OperatingSystem,
            os: version.Os,
            version: version.Version,
        })
    },
})

export type EngineQueryService = ReturnType<typeof createEngineQueryService>
