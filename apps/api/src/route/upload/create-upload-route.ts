import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { artifactDeleteSchema, uploadSessionCreateSchema } from '@containers/contracts/upload'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { toStreamChunks } from '../../lib/stream-chunks'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'
import type { UploadService } from '../../service/domain/upload/create-upload-service'

const uploadRoles = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR]
const chunkQuerySchema = z.object({ offset: z.coerce.number().int().nonnegative() })
const idempotencyKeySchema = z.object({ 'idempotency-key': z.string().min(8).max(128) })
const chunkSha256Schema = z.object({ 'x-chunk-sha256': z.string().regex(/^[a-f0-9]{64}$/) })
const sessionIdParamSchema = z.object({ sessionId: z.uuid() })
const artifactIdParamSchema = z.object({ artifactId: z.uuid() })
const ARTIFACT_REMOVE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000

type UploadRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
    auditService: Pick<AuditService, 'record'>
    uploadService: Pick<UploadService, 'appendChunk' | 'createSession' | 'getOwnedSession' | 'listArtifacts' | 'removeArtifact'>
}

export const createUploadRoute = ({ apiKeyService, auditService, authService, operationJobService, uploadService }: UploadRouteDependencies) => {
    const requireActor = async (headers: Headers, scope: ApiKeyScope) => {
        if (headers.has('authorization')) {
            return (await apiKeyService.authenticate(headers, scope)).actorId
        }
        return (await authService.requireRole(headers, uploadRoles)).user.id
    }

    return new Hono()
        .get(
            '/artifacts',
            describeRoute({
                responses: { 200: { description: 'artifact 목록' } },
                summary: 'artifact 목록 조회',
                tags: ['Upload'],
            }),
            withErrorHandling(async (context) => {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, [
                        USER_ROLE.OWNER,
                        USER_ROLE.ADMIN,
                        USER_ROLE.OPERATOR,
                        USER_ROLE.VIEWER,
                        USER_ROLE.AUDITOR,
                    ])
                }
                return context.json(successResponse(await uploadService.listArtifacts()), 200)
            }),
        )
        .delete(
            '/artifacts/:artifactId',
            describeRoute({
                responses: { 200: { description: 'artifact 삭제' } },
                summary: 'artifact 삭제',
                tags: ['Upload'],
            }),
            validator('param', artifactIdParamSchema),
            validator('json', artifactDeleteSchema),
            withErrorHandling(async (context) => {
                const { artifactId } = context.req.valid('param' as never) as z.infer<typeof artifactIdParamSchema>
                const session = await authService.requireRecentRole(context.req.raw.headers, ARTIFACT_REMOVE_ROLES, RECENT_AUTH_MAX_AGE_MS)
                const audit = {
                    actorId: session.user.id,
                    operation: 'artifact.remove',
                    requestId: context.get('requestId'),
                    sourceIp: context.req.raw.headers.get('x-real-ip')?.trim() || undefined,
                    targetId: artifactId,
                    targetType: 'artifact' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const removed = await uploadService.removeArtifact(artifactId, context.req.valid('json' as never))
                    await auditService.record({ ...audit, detail: { sha256: removed.sha256 }, result: 'success' })
                    return context.json(successResponse(removed), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'ARTIFACT_REMOVE_FAILED'
                    await auditService.record({ ...audit, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .post(
            '/uploads/sessions',
            describeRoute({
                responses: { 201: { description: '업로드 세션 생성' } },
                summary: '업로드 세션 생성',
                tags: ['Upload'],
            }),
            validator('json', uploadSessionCreateSchema),
            validator('header', idempotencyKeySchema),
            withErrorHandling(async (context) => {
                const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
                const { 'idempotency-key': idempotencyKey } = context.req.valid('header' as never) as z.infer<typeof idempotencyKeySchema>
                return context.json(
                    successResponse(await uploadService.createSession(actorId, idempotencyKey, context.req.valid('json' as never))),
                    201,
                )
            }),
        )
        .put(
            '/uploads/sessions/:sessionId/chunks',
            describeRoute({
                responses: { 200: { description: '업로드 chunk 저장' } },
                summary: '업로드 chunk 저장',
                tags: ['Upload'],
            }),
            validator('param', sessionIdParamSchema),
            validator('query', chunkQuerySchema),
            validator('header', chunkSha256Schema),
            withErrorHandling(async (context) => {
                const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
                const sessionId = (context.req.valid('param' as never) as z.infer<typeof sessionIdParamSchema>).sessionId
                const { offset } = context.req.valid('query' as never) as z.infer<typeof chunkQuerySchema>
                const { 'x-chunk-sha256': chunkSha256 } = context.req.valid('header' as never) as z.infer<typeof chunkSha256Schema>
                const body = context.req.raw.body
                const declaredBytes = Number(context.req.header('content-length'))
                const chunk = body === null ? new Uint8Array(await context.req.arrayBuffer()) : toStreamChunks(body)
                const result = Number.isSafeInteger(declaredBytes)
                    ? await uploadService.appendChunk(actorId, sessionId, offset, chunkSha256, chunk, declaredBytes)
                    : await uploadService.appendChunk(actorId, sessionId, offset, chunkSha256, chunk)
                return context.json(successResponse(result), 200)
            }),
        )
        .post(
            '/uploads/sessions/:sessionId/finalize',
            describeRoute({
                responses: { 202: { description: 'artifact 검증 job' } },
                summary: 'artifact 검증 시작',
                tags: ['Upload'],
            }),
            validator('param', sessionIdParamSchema),
            withErrorHandling(async (context) => {
                const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
                const sessionId = (context.req.valid('param' as never) as z.infer<typeof sessionIdParamSchema>).sessionId
                if (!(await uploadService.getOwnedSession(actorId, sessionId))) {
                    throw createAppError('UPLOAD_SESSION_INVALID')
                }
                const job = await operationJobService.enqueue({
                    createdBy: actorId,
                    kind: OPERATION_JOB_KIND.UPLOAD_FINALIZE,
                    payload: { sessionId },
                    uniqueResourceKey: sessionId,
                })
                return context.json(successResponse({ job }), 202)
            }),
        )
}
