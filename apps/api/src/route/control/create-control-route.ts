import { Hono } from 'hono'
import type { Context } from 'hono'
import {
    containerActionSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    imagePullRequestSchema,
    imageRemoveRequestSchema,
    networkCreateRequestSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import { OPERATION_JOB_KIND, systemPruneJobPayloadSchema } from '@containers/contracts/operation-job'
import { registryCredentialDeleteSchema, registryCredentialUpsertSchema } from '@containers/contracts/registry-credential'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import { createAppError } from '../../lib/app-error'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { ControlService } from '../../service/domain/control/create-control-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const OPERATOR_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR]
const ADMIN_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const RECENT_ADMIN_ACTIONS = ['kill', 'pause', 'remove', 'rename', 'restart', 'start', 'stop', 'unpause', 'update']

type ControlRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    controlService: ControlService
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const getErrorCode = (error: unknown) => (error instanceof Error ? error.message : 'CONTROL_FAILED')

const respondWithError = (context: Context, error: unknown) => {
    const code = getErrorCode(error)

    if (code === 'AUTH_REQUIRED') {
        return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
    }

    if (code === 'FORBIDDEN') {
        return context.json(errorResponse(code, '작업 권한이 없습니다.', context.get('requestId')), 403)
    }

    if (code === 'RECENT_AUTH_REQUIRED') {
        return context.json(errorResponse(code, '최근 로그인이 필요한 작업입니다.', context.get('requestId')), 401)
    }

    if (code.includes('CONFIRMATION_MISMATCH')) {
        return context.json(errorResponse('CONFIRMATION_MISMATCH', '대상 확인 문자열이 일치하지 않습니다.', context.get('requestId')), 409)
    }

    if (code.includes('MANAGEMENT_RESOURCE_PROTECTED')) {
        return context.json(
            errorResponse('MANAGEMENT_RESOURCE_PROTECTED', '관리 plane 리소스는 이 경로에서 변경할 수 없습니다.', context.get('requestId')),
            409,
        )
    }

    if (code.includes('PRUNE_PREVIEW_STALE') || code.includes('PRUNE_NOTHING_TO_DELETE')) {
        return context.json(errorResponse(code, 'prune preview를 다시 확인해 주세요.', context.get('requestId')), 409)
    }

    return context.json(errorResponse('CONTROL_FAILED', 'Docker 작업을 완료할 수 없습니다.', context.get('requestId')), 400)
}

export const createControlRoute = ({ auditService, authService, controlService, operationJobService }: ControlRouteDependencies) =>
    new Hono()
        .get('/containers/:containerId/top', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await controlService.getContainerTop(context.req.param('containerId'))), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .get('/containers/:containerId/changes', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(await controlService.getContainerChanges(context.req.param('containerId'))), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .post('/containers/:containerId/wait', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, OPERATOR_ROLES)
                return context.json(
                    successResponse(await controlService.waitContainer(context.req.param('containerId'), await context.req.json())),
                    200,
                )
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .get('/images', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, [
                    USER_ROLE.OWNER,
                    USER_ROLE.ADMIN,
                    USER_ROLE.OPERATOR,
                    USER_ROLE.VIEWER,
                    USER_ROLE.AUDITOR,
                ])
                return context.json(successResponse(await controlService.getImages()), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .get('/registry-credentials', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(successResponse(await controlService.getRegistryCredentials()), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .post('/registry-credentials', async (context) => {
            let actorId: string | undefined
            try {
                const input = registryCredentialUpsertSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
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
                const credential = await controlService.upsertRegistryCredential(undefined, input)
                await auditService.record({ ...audit, detail: { credentialId: credential.id }, result: 'success' })
                return context.json(successResponse(credential), 201)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'registry-credential.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'registry',
                        targetType: 'registry-credential',
                    })
                }
                return respondWithError(context, error)
            }
        })
        .post('/registry-credentials/:credentialId', async (context) => {
            let actorId: string | undefined
            const credentialId = context.req.param('credentialId')
            try {
                const input = registryCredentialUpsertSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
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
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'registry-credential.rotate',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: credentialId,
                        targetType: 'registry-credential',
                    })
                }
                return respondWithError(context, error)
            }
        })
        .delete('/registry-credentials/:credentialId', async (context) => {
            let actorId: string | undefined
            const credentialId = context.req.param('credentialId')
            try {
                const input = registryCredentialDeleteSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                await auditService.record({
                    actorId,
                    operation: 'registry-credential.remove',
                    requestId: context.get('requestId'),
                    result: 'attempt',
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: credentialId,
                    targetType: 'registry-credential',
                })
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
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'registry-credential.remove',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: credentialId,
                        targetType: 'registry-credential',
                    })
                }
                return respondWithError(context, error)
            }
        })
        .get('/images/:imageId/removal-impact', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(successResponse(await controlService.getImageRemovalImpact(context.req.param('imageId'))), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .get('/system/prune-preview', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ADMIN_ROLES)
                return context.json(
                    successResponse(await controlService.getPrunePreview({ includeVolumes: context.req.query('includeVolumes') === 'true' })),
                    200,
                )
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .post('/system/prune', async (context) => {
            let actorId: string | undefined

            try {
                const input = systemPruneJobPayloadSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
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
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'system.prune',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: 'docker-engine',
                        targetType: 'system',
                    })
                }
                return respondWithError(context, error)
            }
        })
        .get('/networks', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, [
                    USER_ROLE.OWNER,
                    USER_ROLE.ADMIN,
                    USER_ROLE.OPERATOR,
                    USER_ROLE.VIEWER,
                    USER_ROLE.AUDITOR,
                ])
                return context.json(successResponse(await controlService.getNetworks()), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .get('/volumes', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, [
                    USER_ROLE.OWNER,
                    USER_ROLE.ADMIN,
                    USER_ROLE.OPERATOR,
                    USER_ROLE.VIEWER,
                    USER_ROLE.AUDITOR,
                ])
                return context.json(successResponse(await controlService.getVolumes()), 200)
            } catch (error) {
                return respondWithError(context, error)
            }
        })
        .post('/networks', async (context) => {
            let actorId: string | undefined
            let targetId = 'network'

            try {
                const input = networkCreateRequestSchema.parse(await context.req.json())
                targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'network.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'network' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.createNetwork(input)
                await auditService.record({ ...audit, detail: { createdId: result.targetId }, result: 'success' })
                return context.json(successResponse(result), 201)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'network.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'network',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/volumes', async (context) => {
            let actorId: string | undefined
            let targetId = 'volume'

            try {
                const input = volumeCreateRequestSchema.parse(await context.req.json())
                targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'volume.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'volume' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.createVolume(input)
                await auditService.record({ ...audit, result: 'success' })
                return context.json(successResponse(result), 201)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'volume.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'volume',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/containers', async (context) => {
            let actorId: string | undefined
            let targetId = 'container'

            try {
                const input = containerCreateRequestSchema.parse(await context.req.json())
                targetId = input.name
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
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
                const result = await controlService.createContainer(input)
                await auditService.record({ ...audit, detail: { createdId: result.targetId }, result: 'success' })
                return context.json(successResponse(result), 201)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'container.create',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'container',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/containers/:containerId/actions', async (context) => {
            const containerId = context.req.param('containerId')
            let actorId: string | undefined
            let operation = 'container-action'

            try {
                const input = containerActionSchema.parse(await context.req.json())
                operation = `container.${input.action}`
                const session = RECENT_ADMIN_ACTIONS.includes(input.action)
                    ? await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    : await authService.requireRole(context.req.raw.headers, OPERATOR_ROLES)
                actorId = session.user.id
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
                const result = await controlService.performContainerAction(containerId, input)
                await auditService.record({ ...audit, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation,
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: containerId,
                        targetType: 'container',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/containers/:containerId/exec', async (context) => {
            const containerId = context.req.param('containerId')
            let actorId: string | undefined

            try {
                const input = containerExecRequestSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
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
                const result = await controlService.executeContainer(containerId, input)
                await auditService.record({ ...audit, detail: { exitCode: result.exitCode }, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'container.exec',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: containerId,
                        targetType: 'container',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/images/pull', async (context) => {
            let actorId: string | undefined
            let targetId = 'image'

            try {
                const input = imagePullRequestSchema.parse(await context.req.json())
                targetId = input.reference
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'image.pull',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'image' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const job = await operationJobService.enqueue({
                    createdBy: actorId,
                    kind: OPERATION_JOB_KIND.IMAGE_PULL,
                    payload: input,
                })
                await auditService.record({ ...audit, detail: { credentialId: input.credentialId, jobId: job.id }, result: 'success' })
                return context.json(successResponse(job), 202)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'image.pull',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId,
                        targetType: 'image',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .post('/images/:imageId/tag', async (context) => {
            const imageId = context.req.param('imageId')
            let actorId: string | undefined

            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'image.tag',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: imageId,
                    targetType: 'image' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.tagImage(imageId, await context.req.json())
                await auditService.record({ ...audit, detail: { taggedAs: result.targetId }, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'image.tag',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: imageId,
                        targetType: 'image',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .delete('/images/:imageId', async (context) => {
            const imageId = context.req.param('imageId')
            let actorId: string | undefined

            try {
                const input = imageRemoveRequestSchema.parse(await context.req.json())
                const session = await authService.requireRecentRole(
                    context.req.raw.headers,
                    input.force ? [USER_ROLE.OWNER] : ADMIN_ROLES,
                    RECENT_AUTH_MAX_AGE_MS,
                )
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'image.remove',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: imageId,
                    targetType: 'image' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.removeImage(imageId, input)
                await auditService.record({ ...audit, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'image.remove',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: imageId,
                        targetType: 'image',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .delete('/networks/:networkId', async (context) => {
            const networkId = context.req.param('networkId')
            let actorId: string | undefined

            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'network.remove',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: networkId,
                    targetType: 'network' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.removeNetwork(networkId, await context.req.json())
                await auditService.record({ ...audit, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'network.remove',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: networkId,
                        targetType: 'network',
                    })
                }

                return respondWithError(context, error)
            }
        })
        .delete('/volumes/:volumeName', async (context) => {
            const volumeName = context.req.param('volumeName')
            let actorId: string | undefined

            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, ADMIN_ROLES, RECENT_AUTH_MAX_AGE_MS)
                actorId = session.user.id
                const audit = {
                    actorId,
                    operation: 'volume.remove',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: volumeName,
                    targetType: 'volume' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                const result = await controlService.removeVolume(volumeName, await context.req.json())
                await auditService.record({ ...audit, result: 'success' })
                return context.json(successResponse(result), 200)
            } catch (error) {
                if (actorId) {
                    await auditService.record({
                        actorId,
                        detail: { code: getErrorCode(error) },
                        operation: 'volume.remove',
                        requestId: context.get('requestId'),
                        result: 'failure',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: volumeName,
                        targetType: 'volume',
                    })
                }

                return respondWithError(context, error)
            }
        })
