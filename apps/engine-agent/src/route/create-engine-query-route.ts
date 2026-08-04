import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { containerLogRequestSchema } from '@containers/contracts/engine'
import { containerWaitRequestSchema } from '@containers/contracts/engine-control'
import type { EngineQueryService } from '../service/create-engine-query-service'
import { withErrorHandling } from '../lib/with-error-handling'

type EngineQueryRouteDependencies = {
    engineQueryService: EngineQueryService
}

const containerIdParamSchema = z.object({ containerId: z.string().min(1).max(256) })

export const createEngineQueryRoute = ({ engineQueryService }: EngineQueryRouteDependencies) => {
    const route = new Hono()

    route.get(
        '/system/overview',
        describeRoute({ tags: ['engine-query'], summary: 'Docker 시스템 개요 조회', responses: { 200: { description: '개요' } } }),
        withErrorHandling(async (context) => context.json(await engineQueryService.getOverview(), 200)),
    )
    route.get(
        '/containers',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 목록 조회', responses: { 200: { description: '목록' } } }),
        withErrorHandling(async (context) => context.json(await engineQueryService.getContainers(), 200)),
    )
    route.get(
        '/containers/:containerId',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 상세 조회', responses: { 200: { description: '상세' } } }),
        validator('param', containerIdParamSchema),
        withErrorHandling(async (context) => context.json(await engineQueryService.getContainer((context.req.valid('param' as never) as { containerId: string }).containerId), 200)),
    )
    route.get(
        '/containers/:containerId/logs',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 로그 조회', responses: { 200: { description: '로그' } } }),
        validator('param', containerIdParamSchema),
        validator('query', containerLogRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineQueryService.getContainerLogs((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('query' as never)), 200),
        ),
    )
    route.get(
        '/containers/:containerId/top',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 프로세스 조회', responses: { 200: { description: '프로세스' } } }),
        validator('param', containerIdParamSchema),
        withErrorHandling(async (context) => context.json(await engineQueryService.getContainerTop((context.req.valid('param' as never) as { containerId: string }).containerId), 200)),
    )
    route.get(
        '/containers/:containerId/changes',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 변경 사항 조회', responses: { 200: { description: '변경 사항' } } }),
        validator('param', containerIdParamSchema),
        withErrorHandling(async (context) => context.json(await engineQueryService.getContainerChanges((context.req.valid('param' as never) as { containerId: string }).containerId), 200)),
    )
    route.post(
        '/containers/:containerId/wait',
        describeRoute({ tags: ['engine-query'], summary: '컨테이너 상태 대기', responses: { 200: { description: '대기 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerWaitRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineQueryService.waitContainer((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)), 200),
        ),
    )

    return route
}
