import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentStackReleaseService } from '../../service/domain/deployment/create-deployment-stack-release-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const STACK_RELEASE_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const STACK_RELEASE_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const stackReleaseIdParamSchema = z.object({ id: z.uuid() })
const stackIdParamSchema = z.object({ stackId: z.uuid() })

type DeploymentStackReleaseRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRole'>
    deploymentStackReleaseService: Pick<DeploymentStackReleaseService, 'create' | 'get' | 'list'>
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
        await authService.requireRole(headers, STACK_RELEASE_READ_ROLES)
    }
}

const authenticateWrite = async (
    headers: Headers,
    apiKeyService: Pick<ApiKeyService, 'authenticate'>,
    authService: Pick<AuthService, 'requireRole'>,
) => {
    if (headers.has('authorization')) {
        return apiKeyService.authenticate(headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
    }
    const session = await authService.requireRole(headers, STACK_RELEASE_WRITE_ROLES)
    return { actorId: session.user.id, authMethod: 'session' as const }
}

export const createDeploymentStackReleaseRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentStackReleaseService,
    operationJobService,
}: DeploymentStackReleaseRouteDependencies) =>
    new Hono()
        .get(
            '/deployment-stack-releases',
            describeRoute({
                responses: { 200: { description: 'compose 스택 배포 목록' } },
                summary: 'compose 스택 배포 목록 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context: ApiRouteContext) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                return context.json(successResponse(await deploymentStackReleaseService.list()), 200)
            }),
        )
        .get(
            '/deployment-stack-releases/:id',
            describeRoute({
                responses: { 200: { description: 'compose 스택 배포 상세' } },
                summary: 'compose 스택 배포 상세 조회',
                tags: ['Deployment'],
            }),
            validator('param', stackReleaseIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof stackReleaseIdParamSchema> }>) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                const { id } = context.req.valid('param')
                return context.json(successResponse(await deploymentStackReleaseService.get(id)), 200)
            }),
        )
        .post(
            '/deployment-stacks/:stackId/releases',
            describeRoute({
                responses: { 202: { description: 'compose 스택 배포 job' } },
                summary: 'compose 스택 배포 시작',
                tags: ['Deployment'],
            }),
            validator('param', stackIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof stackIdParamSchema> }>) => {
                const { stackId } = context.req.valid('param')
                const audit = {
                    operation: 'deployment.stack.release',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: stackId,
                    targetType: 'deployment-stack' as const,
                }
                const principal = await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                await auditService.record({ ...audit, ...principal, result: 'attempt' })
                try {
                    const stackRelease = await deploymentStackReleaseService.create(principal.actorId, stackId)
                    const job = await operationJobService.enqueue({
                        createdBy: principal.actorId,
                        kind: OPERATION_JOB_KIND.DEPLOY_STACK_RELEASE,
                        maxAttempts: 1,
                        payload: { stackReleaseId: stackRelease.id },
                        uniqueResourceKey: stackRelease.id,
                    })
                    await auditService.record({
                        ...audit,
                        ...principal,
                        detail: { jobId: job.id, stackReleaseId: stackRelease.id },
                        result: 'success',
                    })
                    return context.json(successResponse({ job, stackRelease }), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_STACK_RELEASE_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
