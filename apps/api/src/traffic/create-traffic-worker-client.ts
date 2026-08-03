import { randomUUID } from 'node:crypto'
import { createInternalRequestSignature, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'
import { trafficAnalyticsQuerySchema, trafficAnalyticsSchema, trafficLiveQuerySchema, trafficSummarySchema } from '@containers/contracts/traffic'
import { backupIdSchema, backupSnapshotResultSchema } from '@containers/contracts/backup'
import { trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import { trafficExportResultSchema } from '@containers/contracts/traffic'
import { createAppError } from '../lib/app-error'

const TRAFFIC_REQUEST_TIMEOUT_MS = 5_000

type TrafficWorkerClientDependencies = {
    baseUrl: string
    fetcher?: typeof fetch
    secret: string
}

export const createTrafficWorkerClient = ({ baseUrl, fetcher = fetch, secret }: TrafficWorkerClientDependencies) => ({
    createBackup: async (input: unknown) => {
        const id = backupIdSchema.parse(input)
        const path = `/v1/backups/${id}`
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'POST', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            method: 'POST',
            signal: AbortSignal.timeout(TRAFFIC_REQUEST_TIMEOUT_MS),
        })
        if (!response.ok) {
            const code = await response
                .json()
                .then((body: unknown) =>
                    body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error
                        ? String(body.error.code)
                        : 'BACKUP_TRAFFIC_CREATE_FAILED',
                )
                .catch(() => 'BACKUP_TRAFFIC_CREATE_FAILED')
            throw createAppError(code)
        }
        return backupSnapshotResultSchema.parse(await response.json())
    },
    createExport: async (jobId: string, input: unknown) => {
        const payload = trafficExportJobPayloadSchema.parse(input)
        const path = `/v1/traffic/exports/${jobId}`
        const body = JSON.stringify(payload)
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body, method: 'POST', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            body,
            headers: {
                'content-type': 'application/json',
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            method: 'POST',
            signal: AbortSignal.timeout(TRAFFIC_REQUEST_TIMEOUT_MS),
        })
        if (!response.ok) throw createAppError('TRAFFIC_EXPORT_FAILED')
        return trafficExportResultSchema.parse(await response.json())
    },
    getAnalytics: async (input: unknown) => {
        const query = trafficAnalyticsQuerySchema.parse(input)
        const search = new URLSearchParams({
            limit: query.limit.toString(),
            statusClass: query.statusClass,
            windowMinutes: query.windowMinutes.toString(),
        })

        if (query.pathPrefix) {
            search.set('pathPrefix', query.pathPrefix)
        }

        const path = `/v1/traffic/analytics?${search.toString()}`
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'GET', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            signal: AbortSignal.timeout(TRAFFIC_REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) {
            throw createAppError(`Traffic Worker 응답 코드: ${response.status}`)
        }

        return trafficAnalyticsSchema.parse(await response.json())
    },
    getSummary: async (windowMinutes: number) => {
        const path = `/v1/traffic/summary?windowMinutes=${windowMinutes}`
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'GET', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            signal: AbortSignal.timeout(TRAFFIC_REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) {
            throw createAppError(`Traffic Worker 응답 코드: ${response.status}`)
        }

        return trafficSummarySchema.parse(await response.json())
    },
    openLiveStream: async (input: unknown, signal: AbortSignal) => {
        const query = trafficLiveQuerySchema.parse(input)
        const search = new URLSearchParams({ statusClass: query.statusClass })
        if (query.pathPrefix) search.set('pathPrefix', query.pathPrefix)
        const path = `/v1/traffic/live?${search.toString()}`
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'GET', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            signal,
        })
        if (!response.ok || !response.body) throw createAppError(response.status === 429 ? 'TRAFFIC_STREAM_LIMIT' : 'TRAFFIC_STREAM_FAILED')
        return response.body
    },
    restoreBackup: async (input: unknown) => {
        const id = backupIdSchema.parse(input)
        const path = `/v1/backups/${id}/restore`
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'POST', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            method: 'POST',
            signal: AbortSignal.timeout(TRAFFIC_REQUEST_TIMEOUT_MS),
        })
        if (!response.ok) {
            const code = await response
                .json()
                .then((body: unknown) =>
                    body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error
                        ? String(body.error.code)
                        : 'BACKUP_TRAFFIC_RESTORE_FAILED',
                )
                .catch(() => 'BACKUP_TRAFFIC_RESTORE_FAILED')
            throw createAppError(code)
        }
        return backupSnapshotResultSchema.parse(await response.json())
    },
})

export type TrafficWorkerClient = ReturnType<typeof createTrafficWorkerClient>
