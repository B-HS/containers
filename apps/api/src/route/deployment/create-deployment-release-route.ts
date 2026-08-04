import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentReleaseService } from '../../service/domain/deployment/create-deployment-release-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const RELEASE_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const RELEASE_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const releaseIdParamSchema = z.object({ id: z.uuid() })
const manifestIdParamSchema = z.object({ manifestId: z.uuid() })

type DeploymentReleaseRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentReleaseService: Pick<DeploymentReleaseService, 'create' | 'get' | 'list' | 'prepareRollback'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const authenticateRead = async (
    headers: Headers,
    apiKeyService: Pick<ApiKeyService, 'authenticate'>,
    authService: Pick<AuthService, 'requireRole'>,
) => {
    if (headers.has('authorization')) {
        await apiKeyService.authenticate(headers, API_KEY_SCOPE.DEPLOYMENT_READ)
    } else {
        await authService.requireRole(headers, RELEASE_READ_ROLES)
    }
}

const authenticateWrite = async (
    headers: Headers,
    apiKeyService: Pick<ApiKeyService, 'authenticate'>,
    authService: Pick<AuthService, 'requireRecentRole'>,
) => {
    if (headers.has('authorization')) {
        return apiKeyService.authenticate(headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
    }
    const session = await authService.requireRecentRole(headers, RELEASE_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
    return { actorId: session.user.id, authMethod: 'session' as const }
}

export const createDeploymentReleaseRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentReleaseService,
    operationJobService,
}: DeploymentReleaseRouteDependencies) =>
    new Hono()
        .get(
            '/deployment-releases',
            describeRoute({
                responses: { 200: { description: '배포 release 목록' } },
                summary: '배포 release 목록 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                return context.json(successResponse(await deploymentReleaseService.list()), 200)
            }),
        )
        .get(
            '/deployment-releases/:id',
            describeRoute({
                responses: { 200: { description: '배포 release 상세' } },
                summary: '배포 release 상세 조회',
                tags: ['Deployment'],
            }),
            validator('param', releaseIdParamSchema),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                const { id } = context.req.valid('param' as never) as z.infer<typeof releaseIdParamSchema>
                return context.json(successResponse(await deploymentReleaseService.get(id)), 200)
            }),
        )
        .post(
            '/deployment-releases/:id/rollback',
            describeRoute({
                responses: { 202: { description: '배포 rollback job' } },
                summary: '배포 release rollback',
                tags: ['Deployment'],
            }),
            validator('param', releaseIdParamSchema),
            withErrorHandling(async (context) => {
                const releaseId = (context.req.valid('param' as never) as z.infer<typeof releaseIdParamSchema>).id
                const audit = {
                    operation: 'deployment.release.rollback',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: releaseId,
                    targetType: 'deployment-release' as const,
                }
                const principal = await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                await auditService.record({ ...audit, ...principal, result: 'attempt' })
                try {
                    const release = await deploymentReleaseService.prepareRollback(releaseId)
                    const job = await operationJobService.enqueue({
                        createdBy: principal.actorId,
                        kind: OPERATION_JOB_KIND.DEPLOY_ROLLBACK,
                        maxAttempts: 1,
                        payload: { releaseId: release.id },
                        uniqueResourceKey: release.id,
                    })
                    await auditService.record({ ...audit, ...principal, detail: { jobId: job.id }, result: 'success' })
                    return context.json(successResponse({ job, release }), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_ROLLBACK_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .post(
            '/deployment-manifests/:manifestId/releases',
            describeRoute({
                responses: { 202: { description: '배포 release 생성 job' } },
                summary: '배포 release 생성',
                tags: ['Deployment'],
            }),
            validator('param', manifestIdParamSchema),
            withErrorHandling(async (context) => {
                const manifestId = (context.req.valid('param' as never) as z.infer<typeof manifestIdParamSchema>).manifestId
                const audit = {
                    operation: 'deployment.release.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: manifestId,
                    targetType: 'deployment-release' as const,
                }
                const principal = await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                await auditService.record({ ...audit, ...principal, result: 'attempt' })
                try {
                    const release = await deploymentReleaseService.create(principal.actorId, manifestId)
                    const job = await operationJobService.enqueue({
                        createdBy: principal.actorId,
                        kind: OPERATION_JOB_KIND.DEPLOY_RELEASE,
                        maxAttempts: 1,
                        payload: { releaseId: release.id },
                        uniqueResourceKey: release.id,
                    })
                    await auditService.record({ ...audit, ...principal, detail: { jobId: job.id, releaseId: release.id }, result: 'success' })
                    return context.json(successResponse({ job, release }), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_RELEASE_CREATE_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
