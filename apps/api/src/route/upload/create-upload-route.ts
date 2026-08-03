import { Hono } from 'hono'
import { z } from 'zod'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/app-error'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'
import type { UploadService } from '../../service/domain/upload/create-upload-service'

const uploadRoles = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR]
const chunkQuerySchema = z.object({ offset: z.coerce.number().int().nonnegative() })
const chunkSha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const idempotencyKeySchema = z.string().min(8).max(128)

type UploadRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    authService: Pick<AuthService, 'requireRole'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
    uploadService: Pick<UploadService, 'appendChunk' | 'createSession' | 'getOwnedSession' | 'listArtifacts'>
}

const getUploadErrorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'OFFSET_MISMATCH' || code === 'UPLOAD_CONCURRENCY_LIMIT') return 409 as const
    if (code === 'UPLOAD_SESSION_INVALID') return 410 as const
    if (code === 'API_KEY_RATE_LIMITED') return 429 as const
    if (code === 'DISK_STATUS_UNAVAILABLE') return 503 as const
    if (code === 'DISK_HARD_WATERMARK' || code === 'UPLOAD_QUOTA_EXCEEDED') return 507 as const
    return 400 as const
}

export const createUploadRoute = ({ apiKeyService, authService, operationJobService, uploadService }: UploadRouteDependencies) => {
    const app = new Hono()

    const requireActor = async (headers: Headers, scope: ApiKeyScope) => {
        if (headers.has('authorization')) {
            return (await apiKeyService.authenticate(headers, scope)).actorId
        }
        return (await authService.requireRole(headers, uploadRoles)).user.id
    }

    app.get('/artifacts', async (context) => {
        try {
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
        } catch (error) {
            const code = error instanceof Error ? error.message : 'ARTIFACT_LIST_FAILED'
            return context.json(errorResponse(code, 'Artifact 목록을 조회할 수 없습니다.', context.get('requestId')), getUploadErrorStatus(code))
        }
    })

    app.post('/uploads/sessions', async (context) => {
        try {
            const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
            const idempotencyKey = idempotencyKeySchema.parse(context.req.header('idempotency-key'))
            return context.json(successResponse(await uploadService.createSession(actorId, idempotencyKey, await context.req.json())), 201)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'UPLOAD_SESSION_FAILED'
            return context.json(errorResponse(code, '업로드 세션을 생성할 수 없습니다.', context.get('requestId')), getUploadErrorStatus(code))
        }
    })

    app.put('/uploads/sessions/:sessionId/chunks', async (context) => {
        try {
            const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
            const query = chunkQuerySchema.parse(context.req.query())
            const chunkSha256 = chunkSha256Schema.parse(context.req.header('x-chunk-sha256'))
            const bytes = new Uint8Array(await context.req.arrayBuffer())
            return context.json(
                successResponse(await uploadService.appendChunk(actorId, context.req.param('sessionId'), query.offset, chunkSha256, bytes)),
                200,
            )
        } catch (error) {
            const code = error instanceof Error ? error.message : 'UPLOAD_CHUNK_FAILED'
            return context.json(errorResponse(code, '업로드 chunk를 저장할 수 없습니다.', context.get('requestId')), getUploadErrorStatus(code))
        }
    })

    app.post('/uploads/sessions/:sessionId/finalize', async (context) => {
        try {
            const actorId = await requireActor(context.req.raw.headers, API_KEY_SCOPE.ARTIFACT_UPLOAD)
            const sessionId = context.req.param('sessionId')
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
        } catch (error) {
            const code = error instanceof Error ? error.message : 'UPLOAD_FINALIZE_FAILED'
            return context.json(errorResponse(code, 'Artifact 검증을 완료할 수 없습니다.', context.get('requestId')), getUploadErrorStatus(code))
        }
    })

    return app
}
