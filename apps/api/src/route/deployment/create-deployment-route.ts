import { Hono } from 'hono'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentService } from '../../service/domain/deployment/create-deployment-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000

type DeploymentRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole'>
    deploymentService: Pick<DeploymentService, 'getLoaded'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

export const createDeploymentRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentService,
    operationJobService,
}: DeploymentRouteDependencies) =>
    new Hono().post('/artifacts/:artifactId/load', async (context) => {
        const artifactId = context.req.param('artifactId')
        let actorId: string | undefined
        let authMethod: 'api-key' | 'session' = 'session'
        const audit = {
            operation: 'artifact.load-image',
            requestId: context.get('requestId'),
            sourceIp: getSourceIp(context.req.raw.headers),
            targetId: artifactId,
            targetType: 'artifact' as const,
        }

        try {
            if (context.req.raw.headers.has('authorization')) {
                const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.IMAGE_LOAD)
                actorId = principal.actorId
                authMethod = principal.authMethod
            } else {
                const session = await authService.requireRecentRole(
                    context.req.raw.headers,
                    [USER_ROLE.OWNER, USER_ROLE.ADMIN],
                    RECENT_AUTH_MAX_AGE_MS,
                )
                actorId = session.user.id
            }
            await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })

            const loaded = await deploymentService.getLoaded(artifactId)
            if (loaded) {
                await auditService.record({ ...audit, actorId, authMethod, result: 'success' })
                return context.json(successResponse({ deployment: loaded }), 200)
            }

            const job = await operationJobService.enqueue({
                createdBy: actorId,
                kind: OPERATION_JOB_KIND.DEPLOY_LOAD,
                payload: { artifactId },
                uniqueResourceKey: artifactId,
            })
            await auditService.record({ ...audit, actorId, authMethod, detail: { jobId: job.id }, result: 'success' })
            return context.json(successResponse({ job }), 202)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'IMAGE_LOAD_FAILED'
            if (actorId) {
                await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
            }
            if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') {
                return context.json(errorResponse(code, '최근 로그인이 필요합니다.', context.get('requestId')), 401)
            }
            if (code === 'FORBIDDEN') {
                return context.json(errorResponse(code, '작업 권한이 없습니다.', context.get('requestId')), 403)
            }
            if (code === 'API_KEY_RATE_LIMITED') {
                return context.json(errorResponse(code, 'API key 요청 한도를 초과했습니다.', context.get('requestId')), 429)
            }
            if (code === 'ARTIFACT_NOT_READY') {
                return context.json(errorResponse(code, 'ready artifact를 찾을 수 없습니다.', context.get('requestId')), 409)
            }
            return context.json(errorResponse('IMAGE_LOAD_FAILED', 'Docker image를 불러올 수 없습니다.', context.get('requestId')), 400)
        }
    })
