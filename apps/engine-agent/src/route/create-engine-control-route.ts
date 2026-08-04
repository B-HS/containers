import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import {
    buildCachePruneRequestSchema,
    containerActionSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    containerHealthProbeRequestSchema,
    containerNetworkAttachmentSchema,
    dockerResourceRemoveRequestSchema,
    imagePullRequestSchema,
    imageRemoveRequestSchema,
    imageTagRequestSchema,
    networkCreateRequestSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import { imageLoadRequestSchema } from '@containers/contracts/upload'
import type { EngineControlService } from '../service/create-engine-control-service'
import { withErrorHandling } from '../lib/with-error-handling'

type EngineControlRouteDependencies = {
    engineControlService: EngineControlService
}

const containerIdParamSchema = z.object({ containerId: z.string().min(1).max(256) })
const imageIdParamSchema = z.object({ imageId: z.string().min(1).max(256) })
const networkIdParamSchema = z.object({ networkId: z.string().min(1).max(256) })
const volumeNameParamSchema = z.object({ volumeName: z.string().min(1).max(256) })
const prunePreviewQuerySchema = z.object({
    includeVolumes: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
})

export const createEngineControlRoute = ({ engineControlService }: EngineControlRouteDependencies) => {
    const route = new Hono()

    route.post(
        '/containers',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 생성', responses: { 201: { description: '생성 결과' } } }),
        validator('json', containerCreateRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.createContainer(context.req.valid('json' as never)), 201)),
    )
    route.get(
        '/images',
        describeRoute({ tags: ['engine-control'], summary: '이미지 목록 조회', responses: { 200: { description: '목록' } } }),
        withErrorHandling(async (context) => context.json(await engineControlService.getImages(), 200)),
    )
    route.get(
        '/images/:imageId/removal-impact',
        describeRoute({ tags: ['engine-control'], summary: '이미지 삭제 영향도 조회', responses: { 200: { description: '영향도' } } }),
        validator('param', imageIdParamSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.getImageRemovalImpact((context.req.valid('param' as never) as { imageId: string }).imageId), 200)),
    )
    route.get(
        '/networks',
        describeRoute({ tags: ['engine-control'], summary: '네트워크 목록 조회', responses: { 200: { description: '목록' } } }),
        withErrorHandling(async (context) => context.json(await engineControlService.getNetworks(), 200)),
    )
    route.get(
        '/volumes',
        describeRoute({ tags: ['engine-control'], summary: '볼륨 목록 조회', responses: { 200: { description: '목록' } } }),
        withErrorHandling(async (context) => context.json(await engineControlService.getVolumes(), 200)),
    )
    route.get(
        '/system/prune-preview',
        describeRoute({ tags: ['engine-control'], summary: 'prune preview 조회', responses: { 200: { description: '미리보기' } } }),
        validator('query', prunePreviewQuerySchema),
        withErrorHandling(async (context) => context.json(await engineControlService.getPrunePreview(context.req.valid('query' as never)), 200)),
    )
    route.post(
        '/system/prune-build-cache',
        describeRoute({ tags: ['engine-control'], summary: '빌드 캐시 정리', responses: { 200: { description: '정리 결과' } } }),
        validator('json', buildCachePruneRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.pruneBuildCache(context.req.valid('json' as never)), 200)),
    )
    route.post(
        '/networks',
        describeRoute({ tags: ['engine-control'], summary: '네트워크 생성', responses: { 201: { description: '생성 결과' } } }),
        validator('json', networkCreateRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.createNetwork(context.req.valid('json' as never)), 201)),
    )
    route.post(
        '/volumes',
        describeRoute({ tags: ['engine-control'], summary: '볼륨 생성', responses: { 201: { description: '생성 결과' } } }),
        validator('json', volumeCreateRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.createVolume(context.req.valid('json' as never)), 201)),
    )
    route.post(
        '/images/pull',
        describeRoute({ tags: ['engine-control'], summary: '이미지 pull', responses: { 200: { description: 'pull 결과' } } }),
        validator('json', imagePullRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.pullImage(context.req.valid('json' as never)), 200)),
    )
    route.post(
        '/images/:imageId/tag',
        describeRoute({ tags: ['engine-control'], summary: '이미지 태그 지정', responses: { 200: { description: '태그 결과' } } }),
        validator('param', imageIdParamSchema),
        validator('json', imageTagRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.tagImage((context.req.valid('param' as never) as { imageId: string }).imageId, context.req.valid('json' as never)), 200),
        ),
    )
    route.post(
        '/images/load',
        describeRoute({ tags: ['engine-control'], summary: '이미지 load', responses: { 200: { description: 'load 결과' } } }),
        validator('json', imageLoadRequestSchema),
        withErrorHandling(async (context) => context.json(await engineControlService.loadImage(context.req.valid('json' as never)), 200)),
    )
    route.post(
        '/containers/:containerId/actions',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 작업 수행', responses: { 200: { description: '작업 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerActionSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.performContainerAction((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)), 200),
        ),
    )
    route.post(
        '/containers/:containerId/exec',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 명령 실행', responses: { 200: { description: '실행 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerExecRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.executeContainer((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)), 200),
        ),
    )
    route.post(
        '/containers/:containerId/networks/connect',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 네트워크 연결', responses: { 200: { description: '연결 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerNetworkAttachmentSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.connectContainerNetwork((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)), 200),
        ),
    )
    route.post(
        '/containers/:containerId/networks/disconnect',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 네트워크 분리', responses: { 200: { description: '분리 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerNetworkAttachmentSchema),
        withErrorHandling(async (context) =>
            context.json(
                await engineControlService.disconnectContainerNetwork((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)),
                200,
            ),
        ),
    )
    route.post(
        '/containers/:containerId/probe',
        describeRoute({ tags: ['engine-control'], summary: '컨테이너 상태 확인', responses: { 200: { description: '확인 결과' } } }),
        validator('param', containerIdParamSchema),
        validator('json', containerHealthProbeRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.probeContainer((context.req.valid('param' as never) as { containerId: string }).containerId, context.req.valid('json' as never)), 200),
        ),
    )
    route.delete(
        '/images/:imageId',
        describeRoute({ tags: ['engine-control'], summary: '이미지 삭제', responses: { 200: { description: '삭제 결과' } } }),
        validator('param', imageIdParamSchema),
        validator('json', imageRemoveRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.removeImage((context.req.valid('param' as never) as { imageId: string }).imageId, context.req.valid('json' as never)), 200),
        ),
    )
    route.delete(
        '/networks/:networkId',
        describeRoute({ tags: ['engine-control'], summary: '네트워크 삭제', responses: { 200: { description: '삭제 결과' } } }),
        validator('param', networkIdParamSchema),
        validator('json', dockerResourceRemoveRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.removeNetwork((context.req.valid('param' as never) as { networkId: string }).networkId, context.req.valid('json' as never)), 200),
        ),
    )
    route.delete(
        '/volumes/:volumeName',
        describeRoute({ tags: ['engine-control'], summary: '볼륨 삭제', responses: { 200: { description: '삭제 결과' } } }),
        validator('param', volumeNameParamSchema),
        validator('json', dockerResourceRemoveRequestSchema),
        withErrorHandling(async (context) =>
            context.json(await engineControlService.removeVolume((context.req.valid('param' as never) as { volumeName: string }).volumeName, context.req.valid('json' as never)), 200),
        ),
    )

    return route
}
