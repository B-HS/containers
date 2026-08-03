import { Hono } from 'hono'
import { join } from 'node:path'
import { z } from 'zod'
import { OPERATION_JOB_KIND, trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import { trafficAnalyticsQuerySchema, trafficExportResultSchema, trafficLiveQuerySchema } from '@containers/contracts/traffic'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/app-error'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { TrafficService } from '../../service/domain/traffic/create-traffic-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const summaryQuerySchema = z.object({ windowMinutes: z.coerce.number().int().min(1).max(1_440).default(1) })
const SESSION_RECHECK_INTERVAL_MS = 15_000
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const EXPORT_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

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
        .get('/traffic/analytics', async (context) => {
            try {
                await authorize(context.req.raw.headers)
                return context.json(successResponse(await trafficService.getAnalytics(trafficAnalyticsQuerySchema.parse(context.req.query()))), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'TRAFFIC_UNAVAILABLE'

                if (code === 'AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                }

                if (code === 'FORBIDDEN') {
                    return context.json(errorResponse(code, '조회 권한이 없습니다.', context.get('requestId')), 403)
                }

                return context.json(errorResponse('TRAFFIC_UNAVAILABLE', '트래픽 집계를 조회할 수 없습니다.', context.get('requestId')), 503)
            }
        })
        .get('/traffic/live', async (context) => {
            const headers = context.req.raw.headers
            const upstreamController = new AbortController()
            try {
                await authorize(headers)
                const query = trafficLiveQuerySchema.parse(context.req.query())
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
            } catch (error) {
                upstreamController.abort()
                const code = error instanceof Error ? error.message : 'TRAFFIC_STREAM_FAILED'
                if (code === 'AUTH_REQUIRED') return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                if (code === 'FORBIDDEN') return context.json(errorResponse(code, '조회 권한이 없습니다.', context.get('requestId')), 403)
                if (code === 'TRAFFIC_STREAM_LIMIT') {
                    return context.json(errorResponse(code, '실시간 트래픽 연결 한도를 초과했습니다.', context.get('requestId')), 429)
                }
                return context.json(errorResponse('TRAFFIC_STREAM_FAILED', '실시간 트래픽을 연결할 수 없습니다.', context.get('requestId')), 503)
            }
        })
        .get('/traffic/summary', async (context) => {
            try {
                await authorize(context.req.raw.headers)
                const query = summaryQuerySchema.parse(context.req.query())
                return context.json(successResponse(await trafficService.getSummary(query.windowMinutes)), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'TRAFFIC_UNAVAILABLE'

                if (code === 'AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                }

                if (code === 'FORBIDDEN') {
                    return context.json(errorResponse(code, '조회 권한이 없습니다.', context.get('requestId')), 403)
                }

                return context.json(errorResponse('TRAFFIC_UNAVAILABLE', '트래픽 집계를 조회할 수 없습니다.', context.get('requestId')), 503)
            }
        })
        .post('/traffic/exports', async (context) => {
            try {
                const session = await authorizeExport(context.req.raw.headers)
                const payload = trafficExportJobPayloadSchema.parse(await context.req.json())
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
            } catch (error) {
                const code = error instanceof Error ? error.message : 'TRAFFIC_EXPORT_CREATE_FAILED'
                if (code === 'AUTH_REQUIRED') return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                if (code === 'FORBIDDEN') return context.json(errorResponse(code, '내보내기 권한이 없습니다.', context.get('requestId')), 403)
                return context.json(errorResponse(code, '트래픽 내보내기 작업을 만들 수 없습니다.', context.get('requestId')), 400)
            }
        })
        .get('/traffic/exports/:jobId/download', async (context) => {
            try {
                const session = await authorizeExport(context.req.raw.headers)
                const job = await operationJobService.get(context.req.param('jobId'))
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
            } catch (error) {
                const code = error instanceof Error ? error.message : 'TRAFFIC_EXPORT_DOWNLOAD_FAILED'
                if (code === 'AUTH_REQUIRED') return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                if (code === 'FORBIDDEN') return context.json(errorResponse(code, '다운로드 권한이 없습니다.', context.get('requestId')), 403)
                if (code === 'TRAFFIC_EXPORT_NOT_READY') {
                    return context.json(errorResponse(code, '내보내기가 아직 완료되지 않았습니다.', context.get('requestId')), 409)
                }
                return context.json(errorResponse(code, '내보내기 파일을 찾을 수 없습니다.', context.get('requestId')), 404)
            }
        })
}
