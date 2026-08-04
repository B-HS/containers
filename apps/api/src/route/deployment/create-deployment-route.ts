import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentService } from '../../service/domain/deployment/create-deployment-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const artifactIdParamSchema = z.object({ artifactId: z.uuid() })

type DeploymentRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole'>
    deploymentService: Pick<DeploymentService, 'getLoaded'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createDeploymentRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentService,
    operationJobService,
}: DeploymentRouteDependencies) =>
    new Hono().post(
        '/artifacts/:artifactId/load',
        describeRoute({
            responses: {
                200: { description: '이미 load된 deployment' },
                202: { description: 'load job 생성' },
            },
            summary: 'Docker image load',
            tags: ['Deployment'],
        }),
        validator('param', artifactIdParamSchema),
        withErrorHandling(async (context) => {
            const artifactId = (context.req.valid('param' as never) as z.infer<typeof artifactIdParamSchema>).artifactId
            const audit = {
                operation: 'artifact.load-image',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: artifactId,
                targetType: 'artifact' as const,
            }
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            if (context.req.raw.headers.has('authorization')) {
                const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.IMAGE_LOAD)
                actorId = principal.actorId
                authMethod = principal.authMethod
            } else {
                actorId = (await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER, USER_ROLE.ADMIN], RECENT_AUTH_MAX_AGE_MS))
                    .user.id
            }
            await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
            try {
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
                await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                throw error
            }
        }),
    )
