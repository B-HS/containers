import { z } from 'zod'

export const MAX_CONCURRENT_ENGINE_STREAMS = 20
export const SSE_STREAM_OPEN_COMMENT = ': connected\n\n'

export const engineStreamEventSchema = z.object({
    action: z.string(),
    actorId: z.string(),
    actorName: z.string().nullable(),
    kind: z.literal('event'),
    scope: z.string(),
    time: z.iso.datetime(),
    type: z.string(),
})

export const containerLogStreamChunkSchema = z.object({
    kind: z.literal('log'),
    stream: z.enum(['stdout', 'stderr']),
    text: z.string(),
    truncated: z.boolean(),
})

export const containerStatsSampleSchema = z.object({
    cpuPercent: z.number().nullable(),
    kind: z.literal('stats'),
    memoryLimitBytes: z.number().nullable(),
    memoryPercent: z.number().nullable(),
    memoryUsedBytes: z.number().nullable(),
    networkRxBytes: z.number().nullable(),
    networkTxBytes: z.number().nullable(),
    pids: z.number().nullable(),
    readAt: z.iso.datetime().nullable(),
})

export const containerLogStreamQuerySchema = z.object({
    tail: z.coerce.number().int().min(0).max(5_000).default(200),
})

export type EngineStreamEvent = z.infer<typeof engineStreamEventSchema>
export type ContainerLogStreamChunk = z.infer<typeof containerLogStreamChunkSchema>
export type ContainerStatsSample = z.infer<typeof containerStatsSampleSchema>
