import { createHash } from 'node:crypto'
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { trafficExportResultSchema } from '@containers/contracts/traffic'
import { trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import { z } from 'zod'
import type { TrafficQueryClient } from '../../db/create-query-worker'

const EXPORT_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000
const EXPORT_PAGE_SIZE = 5_000
const EXPORT_FILE_MODE = 0o600
const CSV_HEADER = [
    'occurredAt',
    'requestId',
    'host',
    'method',
    'uriPath',
    'status',
    'responseTimeMs',
    'bytesSent',
    'country',
    'clientIpMasked',
] as const
const jobIdSchema = z.uuid()

type TrafficExportServiceDependencies = {
    exportRoot: string
    now: () => number
    queryClient: Pick<TrafficQueryClient, 'getExportEvents'>
}

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

const csvCell = (value: string | number) => {
    const stringValue = String(value)
    const safeValue = /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue
    return `"${safeValue.replaceAll('"', '""')}"`
}

export const createTrafficExportService = ({ exportRoot, now, queryClient }: TrafficExportServiceDependencies) => {
    const cleanup = async () => {
        await mkdir(exportRoot, { recursive: true })
        const entries = await readdir(exportRoot, { withFileTypes: true })
        await Promise.all(
            entries.map(async (entry) => {
                if (!entry.isFile()) return
                if (!/^traffic-[0-9a-f-]{36}\.(csv|ndjson)(\.tmp)?$/.test(entry.name)) return
                const filePath = join(exportRoot, entry.name)
                if ((await stat(filePath)).mtimeMs < now() - EXPORT_RETENTION_MS) await unlink(filePath)
            }),
        )
    }

    return {
        create: async (jobIdInput: unknown, payloadInput: unknown) => {
            const jobId = jobIdSchema.parse(jobIdInput)
            const payload = trafficExportJobPayloadSchema.parse(payloadInput)
            await cleanup()

            const fileName = `traffic-${jobId}.${payload.format}`
            const filePath = join(exportRoot, fileName)
            const temporaryPath = `${filePath}.tmp`
            const to = new Date(payload.to).getTime()
            const hash = createHash('sha256')
            const handle = await open(temporaryPath, 'w', EXPORT_FILE_MODE)
            let bytes = 0
            let cursor = { occurredAt: new Date(payload.from).getTime() - 1, requestId: '' }
            let rowCount = 0

            const writeChunk = async (chunk: string) => {
                if (chunk.length === 0) return
                const buffer = Buffer.from(chunk, 'utf8')
                hash.update(buffer)
                bytes += buffer.byteLength
                await handle.write(buffer)
            }

            try {
                if (payload.format === 'csv') await writeChunk(`${CSV_HEADER.map(csvCell).join(',')}\n`)
                for (;;) {
                    const rows = await queryClient.getExportEvents(cursor, to, EXPORT_PAGE_SIZE)
                    const last = rows.at(-1)
                    if (!last) break
                    const records = rows.map((row) => ({
                        bytesSent: row.bytesSent,
                        clientIpMasked: maskClientIp(row.clientIp),
                        country: row.country,
                        host: row.host,
                        method: row.method,
                        occurredAt: new Date(row.occurredAt).toISOString(),
                        requestId: row.requestId,
                        responseTimeMs: row.requestTimeMs,
                        status: row.status,
                        uriPath: row.uriPath,
                    }))
                    await writeChunk(
                        payload.format === 'ndjson'
                            ? records.map((record) => `${JSON.stringify(record)}\n`).join('')
                            : records
                                  .map(
                                      (record) =>
                                          `${[
                                              record.occurredAt,
                                              record.requestId,
                                              record.host,
                                              record.method,
                                              record.uriPath,
                                              record.status,
                                              record.responseTimeMs,
                                              record.bytesSent,
                                              record.country,
                                              record.clientIpMasked,
                                          ]
                                              .map(csvCell)
                                              .join(',')}\n`,
                                  )
                                  .join(''),
                    )
                    rowCount += rows.length
                    cursor = { occurredAt: last.occurredAt, requestId: last.requestId }
                    if (rows.length < EXPORT_PAGE_SIZE) break
                }
            } finally {
                await handle.close()
            }

            await rename(temporaryPath, filePath)
            return trafficExportResultSchema.parse({
                bytes,
                fileName,
                format: payload.format,
                rowCount,
                sha256: hash.digest('hex'),
            })
        },
    }
}

export type TrafficExportService = ReturnType<typeof createTrafficExportService>
