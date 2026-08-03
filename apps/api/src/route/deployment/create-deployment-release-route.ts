import { Hono } from 'hono'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentReleaseService } from '../../service/domain/deployment/create-deployment-release-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const RELEASE_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const RELEASE_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type DeploymentReleaseRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentReleaseService: Pick<DeploymentReleaseService, 'create' | 'get' | 'list' | 'prepareRollback'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const errorStatus = (code: string) => {
    if (code === 'API_KEY_RATE_LIMITED') {
        return 429 as const
    }
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') {
        return 401 as const
    }
    if (code === 'FORBIDDEN') {
        return 403 as const
    }
    if (code === 'DEPLOYMENT_MANIFEST_NOT_FOUND' || code === 'DEPLOYMENT_RELEASE_NOT_FOUND') {
        return 404 as const
    }
    if (
        code === 'DEPLOYMENT_CONFIGURATION_UNRESOLVED' ||
        code === 'DEPLOYMENT_RELEASE_IN_PROGRESS' ||
        code === 'DEPLOYMENT_ROLLBACK_TARGET_UNAVAILABLE' ||
        code === 'DEPLOYMENT_ROLLBACK_UNAVAILABLE'
    ) {
        return 409 as const
    }
    return 400 as const
}

export const createDeploymentReleaseRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentReleaseService,
    operationJobService,
}: DeploymentReleaseRouteDependencies) =>
    new Hono()
        .get('/deployment-releases', async (context) => {
            try {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, RELEASE_READ_ROLES)
                }
                return context.json(successResponse(await deploymentReleaseService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_RELEASE_LIST_FAILED'
                return context.json(errorResponse(code, '배포 release를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .get('/deployment-releases/:id', async (context) => {
            try {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, RELEASE_READ_ROLES)
                }
                return context.json(successResponse(await deploymentReleaseService.get(context.req.param('id'))), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_RELEASE_GET_FAILED'
                return context.json(errorResponse(code, '배포 release를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/deployment-releases/:id/rollback', async (context) => {
            const releaseId = context.req.param('id')
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            const audit = {
                operation: 'deployment.release.rollback',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: releaseId,
                targetType: 'deployment-release' as const,
            }
            try {
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    const session = await authService.requireRecentRole(context.req.raw.headers, RELEASE_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    actorId = session.user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                const release = await deploymentReleaseService.prepareRollback(releaseId)
                const job = await operationJobService.enqueue({
                    createdBy: actorId,
                    kind: OPERATION_JOB_KIND.DEPLOY_ROLLBACK,
                    maxAttempts: 1,
                    payload: { releaseId: release.id },
                    uniqueResourceKey: release.id,
                })
                await auditService.record({ ...audit, actorId, authMethod, detail: { jobId: job.id }, result: 'success' })
                return context.json(successResponse({ job, release }), 202)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_ROLLBACK_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '배포 release를 rollback할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/deployment-manifests/:manifestId/releases', async (context) => {
            const manifestId = context.req.param('manifestId')
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            const audit = {
                operation: 'deployment.release.create',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: manifestId,
                targetType: 'deployment-release' as const,
            }
            try {
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    const session = await authService.requireRecentRole(context.req.raw.headers, RELEASE_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    actorId = session.user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                const release = await deploymentReleaseService.create(actorId, manifestId)
                const job = await operationJobService.enqueue({
                    createdBy: actorId,
                    kind: OPERATION_JOB_KIND.DEPLOY_RELEASE,
                    maxAttempts: 1,
                    payload: { releaseId: release.id },
                    uniqueResourceKey: release.id,
                })
                await auditService.record({ ...audit, actorId, authMethod, detail: { jobId: job.id, releaseId: release.id }, result: 'success' })
                return context.json(successResponse({ job, release }), 202)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_RELEASE_CREATE_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '배포 release를 시작할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
