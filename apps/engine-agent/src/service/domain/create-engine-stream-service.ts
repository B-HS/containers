import type { Readable } from 'node:stream'
import { z } from 'zod'
import {
    containerLogStreamChunkSchema,
    containerStatsSampleSchema,
    engineStreamEventSchema,
    type ContainerStatsSample,
    type EngineStreamEvent,
} from '@containers/contracts/engine-stream'
import type { createDockerEngineClient } from '../shared/create-docker-engine-client'
import { createAppError } from '../../lib/error'
import { createLineParser, createMultiplexFrameParser } from '../shared/create-stream-parsers'

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const MANAGEMENT_LABEL = 'managed-by'
const MANAGEMENT_LABEL_VALUE = 'containers-control-plane'
const MANAGEMENT_PROJECT = 'containers'

const isManagementPlaneResource = (labels: Record<string, string>) =>
    labels[COMPOSE_PROJECT_LABEL] === MANAGEMENT_PROJECT || labels[MANAGEMENT_LABEL] === MANAGEMENT_LABEL_VALUE

const containerMatchesReference = (containerId: string, containerNames: string[], reference: string) =>
    containerId === reference || containerId.startsWith(reference) || containerNames.includes(reference)

const SSE_HEARTBEAT_INTERVAL_MS = 15_000
const STREAM_MAX_DURATION_MS = 30 * 60 * 1_000
const MAX_CONCURRENT_STREAMS = 20
const FULL_PERCENT = 100

type EngineStreamServiceDependencies = {
    dockerEngineClient: Pick<
        ReturnType<typeof createDockerEngineClient>,
        'getContainers' | 'openContainerLogStream' | 'openContainerStatsStream' | 'openEventStream'
    >
    now: () => Date
}

const dockerEventSchema = z.object({
    Action: z.string(),
    Actor: z.object({ Attributes: z.record(z.string(), z.string()).optional(), ID: z.string() }).optional(),
    scope: z.string().optional(),
    time: z.number().optional(),
    Type: z.string(),
})

const dockerStatsSchema = z.object({
    cpu_stats: z
        .object({
            cpu_usage: z.object({ total_usage: z.number() }),
            online_cpus: z.number().optional(),
            system_cpu_usage: z.number().optional(),
        })
        .optional(),
    memory_stats: z
        .object({
            limit: z.number().optional(),
            stats: z.record(z.string(), z.number()).optional(),
            usage: z.number().optional(),
        })
        .optional(),
    networks: z.record(z.string(), z.object({ rx_bytes: z.number(), tx_bytes: z.number() })).optional(),
    pids_stats: z.object({ current: z.number().optional() }).optional(),
    precpu_stats: z
        .object({
            cpu_usage: z.object({ total_usage: z.number() }).optional(),
            system_cpu_usage: z.number().optional(),
        })
        .optional(),
    read: z.string().optional(),
})

export const normalizeEngineEvent = (line: string, fallbackTime: Date): EngineStreamEvent | null => {
    let parsed: unknown
    try {
        parsed = JSON.parse(line)
    } catch {
        return null
    }
    const event = dockerEventSchema.safeParse(parsed)
    if (!event.success) {
        return null
    }
    return engineStreamEventSchema.parse({
        action: event.data.Action,
        actorId: event.data.Actor?.ID ?? '',
        actorName: event.data.Actor?.Attributes?.name ?? null,
        kind: 'event',
        scope: event.data.scope ?? 'local',
        time: event.data.time === undefined ? fallbackTime.toISOString() : new Date(event.data.time * 1_000).toISOString(),
        type: event.data.Type,
    })
}

export const normalizeContainerStats = (line: string): ContainerStatsSample | null => {
    let parsed: unknown
    try {
        parsed = JSON.parse(line)
    } catch {
        return null
    }
    const stats = dockerStatsSchema.safeParse(parsed)
    if (!stats.success) {
        return null
    }
    const cpu = stats.data.cpu_stats
    const precpu = stats.data.precpu_stats
    const cpuDelta = cpu === undefined || precpu?.cpu_usage === undefined ? null : cpu.cpu_usage.total_usage - precpu.cpu_usage.total_usage
    const systemDelta =
        cpu?.system_cpu_usage === undefined || precpu?.system_cpu_usage === undefined || precpu.system_cpu_usage === 0
            ? null
            : cpu.system_cpu_usage - precpu.system_cpu_usage
    const cpuPercent =
        cpuDelta === null || cpuDelta < 0 || systemDelta === null || systemDelta <= 0 || cpu?.online_cpus === undefined
            ? null
            : (cpuDelta / systemDelta) * cpu.online_cpus * FULL_PERCENT
    const memory = stats.data.memory_stats
    const memoryUsedBytes = memory?.usage === undefined ? null : memory.usage - (memory.stats?.inactive_file ?? memory.stats?.cache ?? 0)
    const memoryLimitBytes = memory?.limit ?? null
    const memoryPercent =
        memoryUsedBytes === null || memoryLimitBytes === null || memoryLimitBytes === 0 ? null : (memoryUsedBytes / memoryLimitBytes) * FULL_PERCENT
    const interfaces = Object.values(stats.data.networks ?? {})
    return containerStatsSampleSchema.parse({
        cpuPercent,
        kind: 'stats',
        memoryLimitBytes,
        memoryPercent,
        memoryUsedBytes,
        networkRxBytes: stats.data.networks === undefined ? null : interfaces.reduce((total, item) => total + item.rx_bytes, 0),
        networkTxBytes: stats.data.networks === undefined ? null : interfaces.reduce((total, item) => total + item.tx_bytes, 0),
        pids: stats.data.pids_stats?.current ?? null,
        readAt: stats.data.read === undefined || Number.isNaN(Date.parse(stats.data.read)) ? null : new Date(stats.data.read).toISOString(),
    })
}

export const createEngineStreamService = ({ dockerEngineClient, now }: EngineStreamServiceDependencies) => {
    const encoder = new TextEncoder()
    let activeStreams = 0

    const toSseStream = (source: Readable, transform: (chunk: Buffer) => unknown[]) => {
        let closed = false
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let deadline: ReturnType<typeof setTimeout> | undefined

        const release = () => {
            if (closed) {
                return
            }
            closed = true
            activeStreams -= 1
            clearInterval(heartbeat)
            clearTimeout(deadline)
            source.destroy()
        }

        return new ReadableStream<Uint8Array>({
            start: (controller) => {
                const finish = () => {
                    const wasClosed = closed
                    release()
                    if (!wasClosed) {
                        try {
                            controller.close()
                        } catch {
                            return
                        }
                    }
                }
                source.on('data', (chunk: Buffer) => {
                    if (closed) {
                        return
                    }
                    for (const item of transform(chunk)) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`))
                    }
                    if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                        source.pause()
                    }
                })
                source.on('end', finish)
                source.on('error', finish)
                heartbeat = setInterval(() => {
                    if (!closed) {
                        controller.enqueue(encoder.encode(': heartbeat\n\n'))
                    }
                }, SSE_HEARTBEAT_INTERVAL_MS)
                deadline = setTimeout(finish, STREAM_MAX_DURATION_MS)
            },
            pull: () => {
                source.resume()
            },
            cancel: release,
        })
    }

    const acquire = () => {
        if (activeStreams >= MAX_CONCURRENT_STREAMS) {
            throw createAppError('ENGINE_STREAM_LIMIT')
        }
        activeStreams += 1
    }

    const assertNotManagementPlane = async (containerId: string) => {
        const containers = await dockerEngineClient.getContainers()
        const container = containers.find((candidate) =>
            containerMatchesReference(
                candidate.Id,
                candidate.Names.map((name) => name.replace(/^\//, '')),
                containerId,
            ),
        )
        if (container && isManagementPlaneResource(container.Labels)) {
            throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
        }
    }

    const openWithSource = async <TSource>(open: () => Promise<TSource>) => {
        acquire()
        try {
            return await open()
        } catch (error) {
            activeStreams -= 1
            throw error
        }
    }

    const withSourceCleanup = async <TSource, TResult>(source: TSource, destroy: (source: TSource) => void, build: () => Promise<TResult>) => {
        try {
            return await build()
        } catch (error) {
            activeStreams -= 1
            destroy(source)
            throw error
        }
    }

    return {
        getActiveStreamCount: () => activeStreams,
        openEventStream: async () => {
            const source = await openWithSource(() => dockerEngineClient.openEventStream())
            return withSourceCleanup(
                source,
                (stream) => stream.destroy(),
                async () => {
                    const parser = createLineParser()
                    const managementIds = new Set(
                        (await dockerEngineClient.getContainers())
                            .filter((container) => isManagementPlaneResource(container.Labels))
                            .map((container) => container.Id),
                    )
                    return toSseStream(source, (chunk) =>
                        parser
                            .push(chunk)
                            .map((line) => normalizeEngineEvent(line, now()))
                            .filter((event) => event !== null && !managementIds.has(event.actorId)),
                    )
                },
            )
        },
        openContainerLogStream: async (containerId: string, tail: number) => {
            await assertNotManagementPlane(containerId)
            const { stream, tty } = await openWithSource(() => dockerEngineClient.openContainerLogStream(containerId, tail))
            if (tty) {
                return toSseStream(stream, (chunk) => [
                    containerLogStreamChunkSchema.parse({ kind: 'log', stream: 'stdout', text: chunk.toString('utf8'), truncated: false }),
                ])
            }
            const parser = createMultiplexFrameParser()
            return toSseStream(stream, (chunk) => parser.push(chunk).map((frame) => containerLogStreamChunkSchema.parse({ kind: 'log', ...frame })))
        },
        openContainerStatsStream: async (containerId: string) => {
            await assertNotManagementPlane(containerId)
            const source = await openWithSource(() => dockerEngineClient.openContainerStatsStream(containerId))
            const parser = createLineParser()
            return toSseStream(source, (chunk) =>
                parser
                    .push(chunk)
                    .map((line) => normalizeContainerStats(line))
                    .filter((sample) => sample !== null),
            )
        },
    }
}

export type EngineStreamService = ReturnType<typeof createEngineStreamService>
