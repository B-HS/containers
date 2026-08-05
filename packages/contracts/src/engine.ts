import { z } from 'zod'

export const engineOverviewSchema = z.object({
    architecture: z.string().min(1),
    apiVersion: z.string().min(1),
    containers: z.object({
        paused: z.number().int().nonnegative(),
        running: z.number().int().nonnegative(),
        stopped: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
    }),
    cpus: z.number().int().nonnegative(),
    disk: z.object({
        availableBytes: z.number().int().nonnegative(),
        buildCacheBytes: z.number().int().nonnegative(),
        capacityBytes: z.number().int().nonnegative(),
        containerWritableBytes: z.number().int().nonnegative(),
        estimatedReclaimableBytes: z.number().int().nonnegative(),
        layersBytes: z.number().int().nonnegative(),
        localVolumeBytes: z.number().int().nonnegative(),
        usedBytes: z.number().int().nonnegative(),
    }),
    engineId: z.string().min(1),
    engineName: z.string().min(1),
    images: z.number().int().nonnegative(),
    memoryBytes: z.number().int().nonnegative(),
    minApiVersion: z.string().min(1),
    operatingSystem: z.string().min(1),
    os: z.string().min(1),
    version: z.string().min(1),
})

export const containerSummarySchema = z.object({
    command: z.string(),
    createdAt: z.iso.datetime(),
    exposedPorts: z.array(z.string()),
    id: z.string().min(1),
    image: z.string().min(1),
    imageId: z.string().min(1),
    labelKeys: z.array(z.string()),
    names: z.array(z.string()),
    networks: z.array(z.string()),
    state: z.string().min(1),
    status: z.string().min(1),
})

export const containerSummaryListSchema = z.array(containerSummarySchema)

export const containerDetailSchema = z.object({
    args: z.array(z.string()),
    command: z.array(z.string()),
    createdAt: z.iso.datetime(),
    entrypoint: z.array(z.string()),
    environmentKeys: z.array(z.string()),
    exposedPorts: z.array(z.string()),
    hostname: z.string(),
    id: z.string().min(1),
    image: z.string(),
    labelKeys: z.array(z.string()),
    mounts: z.array(
        z.object({
            destination: z.string(),
            mode: z.string(),
            name: z.string().nullable(),
            readWrite: z.boolean(),
            type: z.string(),
        }),
    ),
    name: z.string(),
    networks: z.array(
        z.object({
            gateway: z.string(),
            ipAddress: z.string(),
            macAddress: z.string(),
            name: z.string(),
        }),
    ),
    platform: z.string(),
    restartCount: z.number().int().nonnegative(),
    state: z.object({
        error: z.string(),
        exitCode: z.number().int(),
        finishedAt: z.string(),
        health: z.string().nullable(),
        paused: z.boolean(),
        pid: z.number().int().nonnegative(),
        restarting: z.boolean(),
        running: z.boolean(),
        startedAt: z.string(),
        status: z.string(),
    }),
    user: z.string(),
    workingDirectory: z.string(),
})

export const containerLogRequestSchema = z.object({
    since: z.iso.datetime().optional(),
    tail: z.coerce.number().int().min(1).max(5_000).default(200),
})

export const containerLogResultSchema = z.object({
    stderr: z.string(),
    stdout: z.string(),
    truncated: z.boolean(),
})

export type EngineOverview = z.infer<typeof engineOverviewSchema>
export type ContainerSummary = z.infer<typeof containerSummarySchema>
