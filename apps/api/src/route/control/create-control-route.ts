import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import {
    containerActionSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    containerWaitRequestSchema,
    imagePullRequestSchema,
    imageRemoveRequestSchema,
    imageTagRequestSchema,
    networkCreateRequestSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import { OPERATION_JOB_KIND, systemPruneJobPayloadSchema } from '@containers/contracts/operation-job'
import { dockerResourceRemoveRequestSchema } from '@containers/contracts/engine-control'
import { registryCredentialDeleteSchema, registryCredentialUpsertSchema } from '@containers/contracts/registry-credential'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { createAppError } from '../../lib/error'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { ControlService } from '../../service/domain/control/create-control-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const OPERATOR_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR]
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const RECENT_ADMIN_ACTIONS = ['kill', 'pause', 'remove', 'rename', 'restart', 'start', 'stop', 'unpause', 'update']

const containerIdParamSchema = z.object({ containerId: z.string().min(1) })
const imageIdParamSchema = z.object({ imageId: z.string().min(1) })
const credentialIdParamSchema = z.object({ credentialId: z.string().min(1) })
const networkIdParamSchema = z.object({ networkId: z.string().min(1) })
const volumeNameParamSchema = z.object({ volumeName: z.string().min(1) })
const prunePreviewQuerySchema = z.object({ includeVolumes: z.coerce.boolean().default(false) })

type ControlRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    controlService: ControlService
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createControlRoute = ({ apiKeyService, auditService, authService, controlService, operationJobService }: ControlRouteDependencies) => {
    const authenticateEngineRead = async (headers: Headers) => {
        if (headers.has('authorization')) {
            await apiKeyService.authenticate(headers, API_KEY_SCOPE.ENGINE_READ)
            return
        }
        await authService.requireRole(headers, ALL_ROLES)
    }

    return new Hono()
        .get(
            '/containers/:containerId/top',
            describeRoute({
                responses: { 200: { description: '컨테이너 프로세스 목록' } },
                summary: '컨테이너 프로세스 조회',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema> }>) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                const { containerId } = context.req.valid('param')
                return context.json(successResponse(await controlService.getContainerTop(containerId)), 200)
            }),
        )
        .get(
            '/containers/:containerId/changes',
            describeRoute({
                responses: { 200: { description: '컨테이너 변경 목록' } },
                summary: '컨테이너 변경 조회',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema> }>) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                const { containerId } = context.req.valid('param')
                return context.json(successResponse(await controlService.getContainerChanges(containerId)), 200)
            }),
        )
        .post(
            '/containers/:containerId/wait',
            describeRoute({
                responses: { 200: { description: '컨테이너 대기 결과' } },
                summary: '컨테이너 상태 대기',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            validator('json', containerWaitRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema>; json: z.infer<typeof containerWaitRequestSchema> }>,
                ) => {
                    await authService.requireRole(context.req.raw.headers, OPERATOR_ROLES)
                    const { containerId } = context.req.valid('param')
                    return context.json(successResponse(await controlService.waitContainer(containerId, context.req.valid('json'))), 200)
                },
            ),
        )
        .get(
            '/images',
            describeRoute({
                responses: { 200: { description: '이미지 목록' } },
                summary: '이미지 목록 조회',
                tags: ['Control'],
            }),
            withErrorHandling(async (context) => {
                await authenticateEngineRead(context.req.raw.headers)
                return context.json(successResponse(await controlService.getImages()), 200)
            }),
        )
        .get(
            '/registry-credentials',
            describeRoute({
                responses: { 200: { description: 'registry credential 목록' } },
                summary: 'registry credential 목록 조회',
                tags: ['Control'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(successResponse(await controlService.getRegistryCredentials()), 200)
            }),
        )
        .post(
            '/registry-credentials',
            describeRoute({
                responses: { 201: { description: 'registry credential 생성' } },
                summary: 'registry credential 생성',
                tags: ['Control'],
            }),
            validator('json', registryCredentialUpsertSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof registryCredentialUpsertSchema> }>) => {
                const input = context.req.valid('json')
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const audit = {
                    actorId,
                    detail: { name: input.name, serverAddress: input.serverAddress, username: input.username },
                    operation: 'registry-credential.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: input.serverAddress,
                    targetType: 'registry-credential' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const credential = await controlService.upsertRegistryCredential(undefined, input)
                    await auditService.record({ ...audit, detail: { credentialId: credential.id }, result: 'success' })
                    return context.json(successResponse(credential), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'registry-credential.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'registry',
                        targetType: 'registry-credential',
                    })
                    throw error
                }
            }),
        )
        .post(
            '/registry-credentials/:credentialId',
            describeRoute({
                responses: { 200: { description: 'registry credential 회전' } },
                summary: 'registry credential 회전',
                tags: ['Control'],
            }),
            validator('param', credentialIdParamSchema),
            validator('json', registryCredentialUpsertSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{
                        param: z.infer<typeof credentialIdParamSchema>
                        json: z.infer<typeof registryCredentialUpsertSchema>
                    }>,
                ) => {
                    const credentialId = context.req.valid('param').credentialId
                    const input = context.req.valid('json')
                    const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    await auditService.record({
                        actorId,
                        detail: { serverAddress: input.serverAddress, username: input.username },
                        operation: 'registry-credential.rotate',
                        requestId: context.get('requestId'),
                        result: 'attempt',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: credentialId,
                        targetType: 'registry-credential',
                    })
                    try {
                        const credential = await controlService.upsertRegistryCredential(credentialId, input)
                        await auditService.record({
                            actorId,
                            detail: { serverAddress: credential.serverAddress, version: credential.version },
                            operation: 'registry-credential.rotate',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: credentialId,
                            targetType: 'registry-credential',
                        })
                        return context.json(successResponse(credential), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'registry-credential.rotate',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: credentialId,
                            targetType: 'registry-credential',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/registry-credentials/:credentialId',
            describeRoute({
                responses: { 200: { description: 'registry credential 삭제' } },
                summary: 'registry credential 삭제',
                tags: ['Control'],
            }),
            validator('param', credentialIdParamSchema),
            validator('json', registryCredentialDeleteSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{
                        param: z.infer<typeof credentialIdParamSchema>
                        json: z.infer<typeof registryCredentialDeleteSchema>
                    }>,
                ) => {
                    const credentialId = context.req.valid('param').credentialId
                    const input = context.req.valid('json')
                    const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    await auditService.record({
                        actorId,
                        operation: 'registry-credential.remove',
                        requestId: context.get('requestId'),
                        result: 'attempt',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: credentialId,
                        targetType: 'registry-credential',
                    })
                    try {
                        const credential = await controlService.removeRegistryCredential(credentialId, input)
                        await auditService.record({
                            actorId,
                            detail: { serverAddress: credential.serverAddress },
                            operation: 'registry-credential.remove',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: credentialId,
                            targetType: 'registry-credential',
                        })
                        return context.json(successResponse(credential), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'registry-credential.remove',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: credentialId,
                            targetType: 'registry-credential',
                        })
                        throw error
                    }
                },
            ),
        )
        .get(
            '/images/:imageId/removal-impact',
            describeRoute({
                responses: { 200: { description: '이미지 삭제 영향도' } },
                summary: '이미지 삭제 영향도 조회',
                tags: ['Control'],
            }),
            validator('param', imageIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof imageIdParamSchema> }>) => {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                const { imageId } = context.req.valid('param')
                return context.json(successResponse(await controlService.getImageRemovalImpact(imageId)), 200)
            }),
        )
        .get(
            '/system/prune-preview',
            describeRoute({
                responses: { 200: { description: 'prune preview' } },
                summary: 'prune preview 조회',
                tags: ['Control'],
            }),
            validator('query', prunePreviewQuerySchema),
            withErrorHandling(async (context: ApiRouteContext<{ query: z.infer<typeof prunePreviewQuerySchema> }>) => {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                const { includeVolumes } = context.req.valid('query')
                return context.json(successResponse(await controlService.getPrunePreview({ includeVolumes })), 200)
            }),
        )
        .post(
            '/system/prune',
            describeRoute({
                responses: { 202: { description: 'prune job 생성' } },
                summary: '시스템 prune 실행',
                tags: ['Control'],
            }),
            validator('json', systemPruneJobPayloadSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof systemPruneJobPayloadSchema> }>) => {
                const input = context.req.valid('json')
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const preview = await controlService.getPrunePreview({ includeVolumes: input.includeVolumes })
                if (preview.sha256 !== input.previewSha256) {
                    throw createAppError('PRUNE_PREVIEW_STALE')
                }
                const candidateCount =
                    preview.buildCache.length + preview.containers.length + preview.images.length + preview.networks.length + preview.volumes.length
                if (candidateCount === 0) {
                    throw createAppError('PRUNE_NOTHING_TO_DELETE')
                }
                const audit = {
                    actorId,
                    detail: { candidateCount, includeVolumes: input.includeVolumes, previewSha256: input.previewSha256 },
                    operation: 'system.prune',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'docker-engine',
                    targetType: 'system' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const job = await operationJobService.enqueue({
                        createdBy: actorId,
                        kind: OPERATION_JOB_KIND.SYSTEM_PRUNE,
                        maxAttempts: 1,
                        payload: input,
                        unique: true,
                    })
                    await auditService.record({ ...audit, detail: { ...audit.detail, jobId: job.id }, result: 'success' })
                    return context.json(successResponse(job), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'system.prune',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'docker-engine',
                        targetType: 'system',
                    })
                    throw error
                }
            }),
        )
        .get(
            '/networks',
            describeRoute({
                responses: { 200: { description: '네트워크 목록' } },
                summary: '네트워크 목록 조회',
                tags: ['Control'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await controlService.getNetworks()), 200)
            }),
        )
        .get(
            '/volumes',
            describeRoute({
                responses: { 200: { description: '볼륨 목록' } },
                summary: '볼륨 목록 조회',
                tags: ['Control'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await controlService.getVolumes()), 200)
            }),
        )
        .post(
            '/networks',
            describeRoute({
                responses: { 201: { description: '네트워크 생성' } },
                summary: '네트워크 생성',
                tags: ['Control'],
            }),
            validator('json', networkCreateRequestSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof networkCreateRequestSchema> }>) => {
                const input = context.req.valid('json')
                const targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'network.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'network' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const result = await controlService.createNetwork(input)
                    await auditService.record({ ...audit, detail: { createdId: result.targetId }, result: 'success' })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'network.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'network',
                    })
                    throw error
                }
            }),
        )
        .post(
            '/volumes',
            describeRoute({
                responses: { 201: { description: '볼륨 생성' } },
                summary: '볼륨 생성',
                tags: ['Control'],
            }),
            validator('json', volumeCreateRequestSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof volumeCreateRequestSchema> }>) => {
                const input = context.req.valid('json')
                const targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'volume.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'volume' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const result = await controlService.createVolume(input)
                    await auditService.record({ ...audit, result: 'success' })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'volume.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'volume',
                    })
                    throw error
                }
            }),
        )
        .post(
            '/containers',
            describeRoute({
                responses: { 201: { description: '컨테이너 생성' } },
                summary: '컨테이너 생성',
                tags: ['Control'],
            }),
            validator('json', containerCreateRequestSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof containerCreateRequestSchema> }>) => {
                const input = context.req.valid('json')
                const targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const audit = {
                    actorId,
                    detail: {
                        autoStart: input.autoStart,
                        image: input.image,
                        memoryBytes: input.memoryBytes,
                        nanoCpus: input.nanoCpus,
                        network: input.network,
                        readOnlyRootFilesystem: input.readOnlyRootFilesystem,
                    },
                    operation: 'container.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'container' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const result = await controlService.createContainer(input)
                    await auditService.record({ ...audit, detail: { createdId: result.targetId }, result: 'success' })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'container.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'container',
                    })
                    throw error
                }
            }),
        )
        .post(
            '/containers/:containerId/actions',
            describeRoute({
                responses: { 200: { description: '컨테이너 액션 결과' } },
                summary: '컨테이너 액션 실행',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            validator('json', containerActionSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema>; json: z.infer<typeof containerActionSchema> }>) => {
                    const containerId = context.req.valid('param').containerId
                    const input = context.req.valid('json')
                    const operation = `container.${input.action}`
                    const session = RECENT_ADMIN_ACTIONS.includes(input.action)
                        ? await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                        : await authService.requireRole(context.req.raw.headers, OPERATOR_ROLES)
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        detail: { action: input.action },
                        operation,
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: containerId,
                        targetType: 'container' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.performContainerAction(containerId, input)
                        await auditService.record({ ...audit, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation,
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: containerId,
                            targetType: 'container',
                        })
                        throw error
                    }
                },
            ),
        )
        .post(
            '/containers/:containerId/exec',
            describeRoute({
                responses: { 200: { description: '컨테이너 exec 결과' } },
                summary: '컨테이너 명령 실행',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            validator('json', containerExecRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{ param: z.infer<typeof containerIdParamSchema>; json: z.infer<typeof containerExecRequestSchema> }>,
                ) => {
                    const containerId = context.req.valid('param').containerId
                    const input = context.req.valid('json')
                    const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        detail: { argumentCount: input.command.length - 1, executable: input.command[0] ?? '' },
                        operation: 'container.exec',
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: containerId,
                        targetType: 'container' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.executeContainer(containerId, input)
                        await auditService.record({ ...audit, detail: { exitCode: result.exitCode }, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'container.exec',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: containerId,
                            targetType: 'container',
                        })
                        throw error
                    }
                },
            ),
        )
        .post(
            '/images/pull',
            describeRoute({
                responses: { 202: { description: '이미지 pull job' } },
                summary: '이미지 pull',
                tags: ['Control'],
            }),
            validator('json', imagePullRequestSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof imagePullRequestSchema> }>) => {
                const input = context.req.valid('json')
                const targetId = input.reference
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'image.pull',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'image' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const job = await operationJobService.enqueue({
                        createdBy: actorId,
                        kind: OPERATION_JOB_KIND.IMAGE_PULL,
                        payload: input,
                    })
                    await auditService.record({ ...audit, detail: { credentialId: input.credentialId, jobId: job.id }, result: 'success' })
                    return context.json(successResponse(job), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                    await auditService.record({
                        actorId,
                        detail: { code },
                        operation: 'image.pull',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'image',
                    })
                    throw error
                }
            }),
        )
        .post(
            '/images/:imageId/tag',
            describeRoute({
                responses: { 200: { description: '이미지 tag 결과' } },
                summary: '이미지 tag',
                tags: ['Control'],
            }),
            validator('param', imageIdParamSchema),
            validator('json', imageTagRequestSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof imageIdParamSchema>; json: z.infer<typeof imageTagRequestSchema> }>) => {
                    const imageId = context.req.valid('param').imageId
                    const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        operation: 'image.tag',
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: imageId,
                        targetType: 'image' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.tagImage(imageId, context.req.valid('json'))
                        await auditService.record({ ...audit, detail: { taggedAs: result.targetId }, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'image.tag',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: imageId,
                            targetType: 'image',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/images/:imageId',
            describeRoute({
                responses: { 200: { description: '이미지 삭제 결과' } },
                summary: '이미지 삭제',
                tags: ['Control'],
            }),
            validator('param', imageIdParamSchema),
            validator('json', imageRemoveRequestSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof imageIdParamSchema>; json: z.infer<typeof imageRemoveRequestSchema> }>) => {
                    const imageId = context.req.valid('param').imageId
                    const input = context.req.valid('json')
                    const session = await authService.requireRecentRole(
                        context.req.raw.headers,
                        input.force ? [USER_ROLE.OWNER] : ADMIN_ROLES,
                        RECENT_AUTH_MAX_AGE_MS,
                    )
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        operation: 'image.remove',
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: imageId,
                        targetType: 'image' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.removeImage(imageId, input)
                        await auditService.record({ ...audit, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'image.remove',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: imageId,
                            targetType: 'image',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/networks/:networkId',
            describeRoute({
                responses: { 200: { description: '네트워크 삭제 결과' } },
                summary: '네트워크 삭제',
                tags: ['Control'],
            }),
            validator('param', networkIdParamSchema),
            validator('json', dockerResourceRemoveRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{
                        param: z.infer<typeof networkIdParamSchema>
                        json: z.infer<typeof dockerResourceRemoveRequestSchema>
                    }>,
                ) => {
                    const networkId = context.req.valid('param').networkId
                    const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        operation: 'network.remove',
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: networkId,
                        targetType: 'network' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.removeNetwork(networkId, context.req.valid('json'))
                        await auditService.record({ ...audit, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'network.remove',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: networkId,
                            targetType: 'network',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/volumes/:volumeName',
            describeRoute({
                responses: { 200: { description: '볼륨 삭제 결과' } },
                summary: '볼륨 삭제',
                tags: ['Control'],
            }),
            validator('param', volumeNameParamSchema),
            validator('json', dockerResourceRemoveRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{
                        param: z.infer<typeof volumeNameParamSchema>
                        json: z.infer<typeof dockerResourceRemoveRequestSchema>
                    }>,
                ) => {
                    const volumeName = context.req.valid('param').volumeName
                    const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    const actorId = session.user.id
                    const audit = {
                        actorId,
                        operation: 'volume.remove',
                        requestId: context.get('requestId'),
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: volumeName,
                        targetType: 'volume' as const,
                    }
                    await auditService.record({ ...audit, result: 'attempt' })
                    try {
                        const result = await controlService.removeVolume(volumeName, context.req.valid('json'))
                        await auditService.record({ ...audit, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'volume.remove',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: volumeName,
                            targetType: 'volume',
                        })
                        throw error
                    }
                },
            ),
        )
}
