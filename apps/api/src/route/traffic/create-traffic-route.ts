import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { join } from 'node:path'
import { z } from 'zod'
import { OPERATION_JOB_KIND, trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import {
    trafficAnalyticsQuerySchema,
    trafficExportResultSchema,
    trafficLiveQuerySchema,
    trafficSummaryQuerySchema,
} from '@containers/contracts/traffic'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { TrafficService } from '../../service/domain/traffic/create-traffic-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const SESSION_RECHECK_INTERVAL_MS = 15_000
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const EXPORT_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const jobIdParamSchema = z.object({ jobId: z.uuid() })

type TrafficRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRole'>
    operationJobService: Pick<OperationJobService, 'enqueue' | 'get'>
    trafficExportRoot: string
    trafficService: TrafficService
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createTrafficRoute = ({
    auditService,
    authService,
    operationJobService,
    trafficExportRoot,
    trafficService,
}: TrafficRouteDependencies) => {
    const authorize = (headers: Headers) => authService.requireRole(headers, ALL_ROLES)
    const authorizeExport = (headers: Headers) => authService.requireRole(headers, EXPORT_ROLES)

    return new Hono()
        .get(
            '/traffic/analytics',
            describeRoute({
                responses: { 200: { description: '트래픽 분석 결과' } },
                summary: '트래픽 분석 조회',
                tags: ['Traffic'],
            }),
            validator('query', trafficAnalyticsQuerySchema),
            withErrorHandling(async (context) => {
                await authorize(context.req.raw.headers)
                const query = context.req.valid('query' as never) as z.infer<typeof trafficAnalyticsQuerySchema>
                return context.json(successResponse(await trafficService.getAnalytics(query)), 200)
            }),
        )
        .get(
            '/traffic/live',
            describeRoute({
                responses: { 200: { description: '실시간 트래픽 SSE' } },
                summary: '실시간 트래픽 조회',
                tags: ['Traffic'],
            }),
            validator('query', trafficLiveQuerySchema),
            withErrorHandling(async (context) => {
                const headers = context.req.raw.headers
                await authorize(headers)
                const query = context.req.valid('query' as never) as z.infer<typeof trafficLiveQuerySchema>
                const upstreamController = new AbortController()
                const upstream = await trafficService.openLiveStream(query, upstreamController.signal)
                const reader = upstream.getReader()
                let recheck: ReturnType<typeof setInterval> | undefined
                const body = new ReadableStream<Uint8Array>({
                    cancel: () => {
                        clearInterval(recheck)
                        upstreamController.abort()
                    },
                    pull: async (controller) => {
                        try {
                            const { done, value } = await reader.read()
                            if (done) {
                                clearInterval(recheck)
                                controller.close()
                                return
                            }
                            controller.enqueue(value)
                        } catch {
                            clearInterval(recheck)
                            controller.close()
                        }
                    },
                    start: () => {
                        recheck = setInterval(() => authorize(headers).catch(() => upstreamController.abort()), SESSION_RECHECK_INTERVAL_MS)
                    },
                })
                return new Response(body, {
                    headers: { 'cache-control': 'no-store', 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' },
                })
            }),
        )
        .get(
            '/traffic/summary',
            describeRoute({
                responses: { 200: { description: '트래픽 요약 결과' } },
                summary: '트래픽 요약 조회',
                tags: ['Traffic'],
            }),
            validator('query', trafficSummaryQuerySchema),
            withErrorHandling(async (context) => {
                await authorize(context.req.raw.headers)
                const { windowMinutes } = context.req.valid('query' as never) as z.infer<typeof trafficSummaryQuerySchema>
                return context.json(successResponse(await trafficService.getSummary(windowMinutes)), 200)
            }),
        )
        .post(
            '/traffic/exports',
            describeRoute({
                responses: { 202: { description: '트래픽 내보내기 job' } },
                summary: '트래픽 내보내기 생성',
                tags: ['Traffic'],
            }),
            validator('json', trafficExportJobPayloadSchema),
            withErrorHandling(async (context) => {
                const session = await authorizeExport(context.req.raw.headers)
                const payload = context.req.valid('json' as never) as z.infer<typeof trafficExportJobPayloadSchema>
                const job = await operationJobService.enqueue({
                    createdBy: session.user.id,
                    kind: OPERATION_JOB_KIND.TRAFFIC_EXPORT,
                    maxAttempts: 1,
                    payload,
                })
                await auditService.record({
                    actorId: session.user.id,
                    authMethod: 'session',
                    detail: payload,
                    operation: 'traffic.export.create',
                    requestId: context.get('requestId'),
                    result: 'success',
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: job.id,
                    targetType: 'job',
                })
                return context.json(successResponse(job), 202)
            }),
        )
        .get(
            '/traffic/exports/:jobId/download',
            describeRoute({
                responses: { 200: { description: '내보내기 파일 다운로드' } },
                summary: '내보내기 파일 다운로드',
                tags: ['Traffic'],
            }),
            validator('param', jobIdParamSchema),
            withErrorHandling(async (context) => {
                const session = await authorizeExport(context.req.raw.headers)
                const jobId = (context.req.valid('param' as never) as z.infer<typeof jobIdParamSchema>).jobId
                const job = await operationJobService.get(jobId)
                if (job.kind !== OPERATION_JOB_KIND.TRAFFIC_EXPORT) throw createAppError('TRAFFIC_EXPORT_NOT_FOUND')
                if (job.status !== 'succeeded') throw createAppError('TRAFFIC_EXPORT_NOT_READY')
                const result = trafficExportResultSchema.parse(job.result)
                if (!/^traffic-[0-9a-f-]{36}\.(csv|ndjson)$/.test(result.fileName)) throw createAppError('TRAFFIC_EXPORT_INVALID')
                const expectedFileName = `traffic-${job.id}.${result.format}`
                if (result.fileName !== expectedFileName) throw createAppError('TRAFFIC_EXPORT_INVALID')
                const file = Bun.file(join(trafficExportRoot, result.fileName))
                if (!(await file.exists())) throw createAppError('TRAFFIC_EXPORT_EXPIRED')
                await auditService.record({
                    actorId: session.user.id,
                    authMethod: 'session',
                    operation: 'traffic.export.download',
                    requestId: context.get('requestId'),
                    result: 'success',
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: job.id,
                    targetType: 'job',
                })
                return new Response(file, {
                    headers: {
                        'cache-control': 'no-store',
                        'content-disposition': `attachment; filename="${result.fileName}"`,
                        'content-type': result.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson',
                    },
                })
            }),
        )
}
