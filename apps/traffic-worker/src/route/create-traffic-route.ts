import { Hono } from 'hono'
import { z } from 'zod'
import { describeRoute, validator } from 'hono-openapi'
import {
    trafficAnalyticsQuerySchema,
    trafficExportJobParamSchema,
    trafficIngestionStateSchema,
    trafficLiveQuerySchema,
    trafficRetentionStateSchema,
    trafficSummaryQuerySchema,
} from '@containers/contracts/traffic'
import { trafficExportJobPayloadSchema } from '@containers/contracts/operation-job'
import type { TrafficIngestionService } from '../service/domain/create-traffic-ingestion-service'
import type { TrafficQueryService } from '../service/domain/create-traffic-query-service'
import type { TrafficRetentionService } from '../service/domain/create-traffic-retention-service'
import type { TrafficExportService } from '../service/domain/create-traffic-export-service'
import type { TrafficSseStream } from '../service/shared/create-traffic-sse-stream'
import { withErrorHandling, type TrafficRouteContext } from '../lib/with-error-handling'

type TrafficRouteDependencies = {
    exportService: TrafficExportService
    ingestionService: Pick<TrafficIngestionService, 'getState'>
    queryService: TrafficQueryService
    retentionService: Pick<TrafficRetentionService, 'getState'>
    sseStream: TrafficSseStream
}

export const createTrafficRoute = ({ exportService, ingestionService, queryService, retentionService, sseStream }: TrafficRouteDependencies) =>
    new Hono()
        .get(
            '/analytics',
            describeRoute({ summary: '트래픽 분석 조회', tags: ['traffic'], responses: { 200: { description: '분석 결과' } } }),
            validator('query', trafficAnalyticsQuerySchema),
            withErrorHandling(async (context: TrafficRouteContext<{ query: z.infer<typeof trafficAnalyticsQuerySchema> }>) => {
                const query = context.req.valid('query')
                return context.json(await queryService.getAnalytics(query), 200)
            }),
        )
        .get(
            '/live',
            describeRoute({ summary: '실시간 트래픽 스트림', tags: ['traffic'], responses: { 200: { description: 'SSE 스트림' } } }),
            validator('query', trafficLiveQuerySchema),
            withErrorHandling((context: TrafficRouteContext<{ query: z.infer<typeof trafficLiveQuerySchema> }>) => {
                const query = context.req.valid('query')
                return sseStream.live(query, context.req.raw.signal)
            }),
        )
        .get(
            '/summary',
            describeRoute({ summary: '트래픽 요약 조회', tags: ['traffic'], responses: { 200: { description: '요약 결과' } } }),
            validator('query', trafficSummaryQuerySchema),
            withErrorHandling(async (context: TrafficRouteContext<{ query: z.infer<typeof trafficSummaryQuerySchema> }>) => {
                const { windowMinutes } = context.req.valid('query')
                return context.json(await queryService.getSummary(windowMinutes), 200)
            }),
        )
        .get(
            '/ingestion',
            describeRoute({ summary: '트래픽 수집 상태 조회', tags: ['traffic'], responses: { 200: { description: '수집 상태' } } }),
            withErrorHandling((context) => context.json(trafficIngestionStateSchema.parse(ingestionService.getState()), 200)),
        )
        .get(
            '/retention',
            describeRoute({ summary: '트래픽 보존 정리 상태 조회', tags: ['traffic'], responses: { 200: { description: '보존 상태' } } }),
            withErrorHandling((context) => context.json(trafficRetentionStateSchema.parse(retentionService.getState()), 200)),
        )
        .post(
            '/exports/:jobId',
            describeRoute({ summary: '트래픽 내보내기 실행', tags: ['traffic'], responses: { 201: { description: '내보내기 결과' } } }),
            validator('param', trafficExportJobParamSchema),
            validator('json', trafficExportJobPayloadSchema),
            withErrorHandling(
                async (
                    context: TrafficRouteContext<{
                        param: z.infer<typeof trafficExportJobParamSchema>
                        json: z.infer<typeof trafficExportJobPayloadSchema>
                    }>,
                ) => {
                    const { jobId } = context.req.valid('param')
                    const payload = context.req.valid('json')
                    return context.json(await exportService.create(jobId, payload), 201)
                },
            ),
        )
