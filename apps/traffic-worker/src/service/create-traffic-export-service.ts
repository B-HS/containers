import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { trafficExportResultSchema } from '@containers/contracts/traffic'
import { trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import { z } from 'zod'
import type { TrafficDatabase } from '../database/create-traffic-database'

const EXPORT_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000
const jobIdSchema = z.uuid()

type TrafficExportServiceDependencies = {
    database: Pick<TrafficDatabase, 'getExportEvents'>
    exportRoot: string
    now: () => number
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

export const createTrafficExportService = ({ database, exportRoot, now }: TrafficExportServiceDependencies) => {
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
            const rows = database.getExportEvents(new Date(payload.from).getTime(), new Date(payload.to).getTime())
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
            const content =
                payload.format === 'ndjson'
                    ? records.map((record) => JSON.stringify(record)).join('\n') + (records.length === 0 ? '' : '\n')
                    : [
                          [
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
                          ],
                          ...records.map((record) => [
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
                          ]),
                      ]
                          .map((row) => row.map(csvCell).join(','))
                          .join('\n') + '\n'
            const fileName = `traffic-${jobId}.${payload.format}`
            const filePath = join(exportRoot, fileName)
            const temporaryPath = `${filePath}.tmp`
            await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
            await rename(temporaryPath, filePath)
            return trafficExportResultSchema.parse({
                bytes: Buffer.byteLength(content),
                fileName,
                format: payload.format,
                rowCount: records.length,
                sha256: createHash('sha256').update(content).digest('hex'),
            })
        },
    }
}

export type TrafficExportService = ReturnType<typeof createTrafficExportService>
