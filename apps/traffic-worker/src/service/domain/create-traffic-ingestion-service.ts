import { mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import {
    nginxAccessEventSchema,
    trafficLiveEventSchema,
    trafficLiveQuerySchema,
    type NginxAccessEvent,
    type TrafficLiveEvent,
} from '@containers/contracts/traffic'
import type { TrafficDatabase } from '../../db/database'
import { createAppError } from '@/lib/error'

const READ_CHUNK_BYTES = 4_194_304
const MAX_SUBSCRIBERS = 64

const checkpointSchema = z.object({
    device: z.string().regex(/^\d+$/),
    discardingOversizedLine: z.boolean(),
    inode: z.string().regex(/^\d+$/),
    offset: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
    version: z.literal(1),
})

type Checkpoint = z.infer<typeof checkpointSchema>

type TrafficIngestionServiceDependencies = {
    accessLogPath: string
    checkpointPath: string
    database: Pick<TrafficDatabase, 'deleteBefore' | 'insertEvents'>
    now: () => number
    retentionMs: number
}

const getIdentity = async (filePath: string) => {
    const fileStats = await stat(filePath, { bigint: true })
    return { device: fileStats.dev.toString(), inode: fileStats.ino.toString(), size: Number(fileStats.size) }
}

const getIdentityIfPresent = async (filePath: string) => {
    try {
        return await getIdentity(filePath)
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
    }
}

const sameIdentity = (left: Pick<Checkpoint, 'device' | 'inode'>, right: Pick<Checkpoint, 'device' | 'inode'>) =>
    left.device === right.device && left.inode === right.inode

export const createTrafficIngestionService = ({ accessLogPath, checkpointPath, database, now, retentionMs }: TrafficIngestionServiceDependencies) => {
    let checkpoint: Checkpoint | undefined
    let checkpointInodeMissing = false
    let checkpointInodeMissingAt: string | null = null
    let checkpointInodeMissingCount = 0
    let duplicateLineCount = 0
    let invalidLineCount = 0
    let ingestedEventCount = 0
    let polling = false
    const subscribers = new Set<{ listener: (event: TrafficLiveEvent) => void; query: ReturnType<typeof trafficLiveQuerySchema.parse> }>()

    const maskClientIp = (clientIp: string) => {
        if (clientIp.includes('.')) {
            const parts = clientIp.split('.')
            return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : 'masked'
        }
        if (clientIp.includes(':')) {
            return `${clientIp
                .split(':')
                .filter((part) => part.length > 0)
                .slice(0, 4)
                .join(':')}::`
        }
        return 'masked'
    }

    const publish = (events: NginxAccessEvent[], insertedRequestIds: string[]) => {
        if (subscribers.size === 0 || insertedRequestIds.length === 0) return
        const inserted = new Set(insertedRequestIds)
        for (const source of events) {
            if (!inserted.has(source.request_id)) continue
            const event = trafficLiveEventSchema.parse({
                bytesSent: source.bytes_sent,
                clientIpMasked: maskClientIp(source.client_ip),
                country: source.country,
                host: source.host,
                method: source.method,
                occurredAt: new Date(source.timestamp).toISOString(),
                requestId: source.request_id,
                responseTimeMs: source.request_time * 1_000,
                status: source.status,
                uriPath: source.uri_path,
            })
            for (const subscriber of subscribers) {
                const statusPrefix = subscriber.query.statusClass === 'all' ? undefined : Number(subscriber.query.statusClass[0])
                if (subscriber.query.pathPrefix && !event.uriPath.startsWith(subscriber.query.pathPrefix)) continue
                if (statusPrefix && Math.floor(event.status / 100) !== statusPrefix) continue
                subscriber.listener(event)
            }
        }
    }

    const persistCheckpoint = async (next: Checkpoint) => {
        await mkdir(dirname(checkpointPath), { recursive: true })
        const temporaryPath = `${checkpointPath}.tmp`
        await writeFile(temporaryPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
        await rename(temporaryPath, checkpointPath)
    }

    const loadCheckpoint = async () => {
        if (checkpoint) return checkpoint
        try {
            checkpoint = checkpointSchema.parse(JSON.parse(await readFile(checkpointPath, 'utf8')))
        } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
            const active = await getIdentity(accessLogPath)
            checkpoint = {
                device: active.device,
                discardingOversizedLine: false,
                inode: active.inode,
                offset: 0,
                updatedAt: new Date(now()).toISOString(),
                version: 1,
            }
        }
        return checkpoint
    }

    const findPathByIdentity = async (current: Checkpoint) => {
        const active = await getIdentity(accessLogPath)
        if (sameIdentity(current, active)) return { active, sourcePath: accessLogPath }
        const entries = await readdir(dirname(accessLogPath), { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile() || entry.name === basename(checkpointPath)) continue
            const candidatePath = join(dirname(accessLogPath), entry.name)
            const candidate = await getIdentity(candidatePath)
            if (sameIdentity(current, candidate)) return { active, sourcePath: candidatePath }
        }
        return { active, sourcePath: undefined }
    }

    const parseCompleteLines = (buffer: Buffer, discardingOversizedLine: boolean) => {
        let cursor = 0
        let discarding = discardingOversizedLine
        let invalidLines = 0
        const events: NginxAccessEvent[] = []

        if (discarding) {
            const newline = buffer.indexOf(0x0a)
            if (newline === -1) return { committedBytes: buffer.length, discarding: true, events, invalidLines }
            cursor = newline + 1
            discarding = false
        }

        const lastNewline = buffer.lastIndexOf(0x0a)
        if (lastNewline < cursor) {
            if (buffer.length === READ_CHUNK_BYTES) return { committedBytes: buffer.length, discarding: true, events, invalidLines: 1 }
            return { committedBytes: cursor, discarding, events, invalidLines }
        }

        const lines = buffer
            .subarray(cursor, lastNewline + 1)
            .toString('utf8')
            .split('\n')
        lines.pop()
        for (const line of lines) {
            if (line.length === 0) continue
            try {
                events.push(nginxAccessEventSchema.parse(JSON.parse(line)))
            } catch {
                invalidLines += 1
            }
        }
        return { committedBytes: lastNewline + 1, discarding, events, invalidLines }
    }

    const poll = async () => {
        if (polling) return
        polling = true
        try {
            if ((await getIdentityIfPresent(accessLogPath)) === undefined) return
            const current = await loadCheckpoint()
            const { active, sourcePath } = await findPathByIdentity(current)
            if (!sourcePath) {
                const reset: Checkpoint = {
                    device: active.device,
                    discardingOversizedLine: false,
                    inode: active.inode,
                    offset: 0,
                    updatedAt: new Date(now()).toISOString(),
                    version: 1,
                }
                await persistCheckpoint(reset)
                checkpoint = reset
                checkpointInodeMissing = true
                checkpointInodeMissingAt = reset.updatedAt
                checkpointInodeMissingCount += 1
                return
            }

            checkpointInodeMissing = false
            const source = await getIdentity(sourcePath)
            const truncated = source.size < current.offset
            const offset = truncated ? 0 : current.offset
            if (source.size > offset) {
                const bytesToRead = Math.min(READ_CHUNK_BYTES, source.size - offset)
                const buffer = Buffer.alloc(bytesToRead)
                const file = await open(sourcePath, 'r')
                const bytesRead = await file
                    .read(buffer, 0, bytesToRead, offset)
                    .then((result) => result.bytesRead)
                    .finally(() => file.close())
                const parsed = parseCompleteLines(buffer.subarray(0, bytesRead), truncated ? false : current.discardingOversizedLine)
                const insertedRequestIds = parsed.events.length > 0 ? database.insertEvents(parsed.events) : []
                const dropRotatedPartial = !sameIdentity(current, active) && offset + bytesRead >= source.size && parsed.committedBytes < bytesRead
                const next: Checkpoint = {
                    ...current,
                    discardingOversizedLine: dropRotatedPartial ? false : parsed.discarding,
                    offset: offset + (dropRotatedPartial ? bytesRead : parsed.committedBytes),
                    updatedAt: new Date(now()).toISOString(),
                }
                await persistCheckpoint(next)
                checkpoint = next
                duplicateLineCount += parsed.events.length - insertedRequestIds.length
                ingestedEventCount += insertedRequestIds.length
                invalidLineCount += parsed.invalidLines + (dropRotatedPartial ? 1 : 0)
                publish(parsed.events, insertedRequestIds)
                database.deleteBefore(now() - retentionMs)
                return
            }

            if (!sameIdentity(current, active)) {
                const next: Checkpoint = {
                    device: active.device,
                    discardingOversizedLine: false,
                    inode: active.inode,
                    offset: 0,
                    updatedAt: new Date(now()).toISOString(),
                    version: 1,
                }
                invalidLineCount += current.discardingOversizedLine ? 1 : 0
                await persistCheckpoint(next)
                checkpoint = next
            }
            database.deleteBefore(now() - retentionMs)
        } finally {
            polling = false
        }
    }

    return {
        getState: () => ({
            checkpointInodeMissing,
            checkpointInodeMissingAt,
            checkpointInodeMissingCount,
            device: checkpoint?.device ?? null,
            discardingOversizedLine: checkpoint?.discardingOversizedLine ?? false,
            duplicateLineCount,
            inode: checkpoint?.inode ?? null,
            ingestedEventCount,
            invalidLineCount,
            offset: checkpoint?.offset ?? 0,
        }),
        poll,
        subscribe: (input: unknown, listener: (event: TrafficLiveEvent) => void) => {
            if (subscribers.size >= MAX_SUBSCRIBERS) throw createAppError('TRAFFIC_STREAM_LIMIT')
            const subscriber = { listener, query: trafficLiveQuerySchema.parse(input) }
            subscribers.add(subscriber)
            return () => subscribers.delete(subscriber)
        },
        start: (intervalMs: number) => {
            const run = () => void poll().catch((error: unknown) => console.error('traffic ingestion poll 실패:', error))
            run()
            const interval = setInterval(run, intervalMs)
            return () => clearInterval(interval)
        },
    }
}

export type TrafficIngestionService = ReturnType<typeof createTrafficIngestionService>
