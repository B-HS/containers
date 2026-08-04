import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { deploymentSecretDeleteSchema, deploymentSecretUpsertSchema } from '@containers/contracts/deployment-secret'
import { OPERATION_JOB_KIND, secretRotateJobPayloadSchema } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentSecretService } from '../../service/domain/deployment/create-deployment-secret-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'
import type { SecretRotationService } from '../../service/domain/deployment/create-secret-rotation-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const SECRET_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const secretIdParamSchema = z.object({ id: z.string().min(1) })

type DeploymentSecretRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentSecretService: Pick<DeploymentSecretService, 'list' | 'remove' | 'upsert'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
    secretRotationService: Pick<SecretRotationService, 'getState'>
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createDeploymentSecretRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentSecretService,
    operationJobService,
    secretRotationService,
}: DeploymentSecretRouteDependencies) =>
    new Hono()
        .get(
            '/deployment-secrets/key-versions',
            describeRoute({
                responses: { 200: { description: '암호화 키 버전' } },
                summary: '암호화 키 버전 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, SECRET_ROLES)
                return context.json(successResponse(secretRotationService.getState()), 200)
            }),
        )
        .post(
            '/deployment-secrets/rotate',
            describeRoute({
                responses: { 202: { description: '키 교체 job 생성' } },
                summary: '암호화 키 교체',
                tags: ['Deployment'],
            }),
            validator('json', secretRotateJobPayloadSchema),
            withErrorHandling(async (context) => {
                const input = context.req.valid('json' as never) as z.infer<typeof secretRotateJobPayloadSchema>
                const session = await authService.requireRecentRole(context.req.raw.headers, [USER_ROLE.OWNER], RECENT_AUTH_MAX_AGE_MS)
                const audit = {
                    actorId: session.user.id,
                    operation: 'deployment.secret.rotate',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'encryption-key',
                    targetType: 'deployment-secret' as const,
                }
                await auditService.record({ ...audit, result: 'attempt' })
                try {
                    const job = await operationJobService.enqueue({
                        createdBy: session.user.id,
                        kind: OPERATION_JOB_KIND.SECRET_ROTATE,
                        maxAttempts: 1,
                        payload: input,
                        unique: true,
                    })
                    await auditService.record({ ...audit, detail: { jobId: job.id }, result: 'success' })
                    return context.json(successResponse(job), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'SECRET_ROTATE_FAILED'
                    await auditService.record({ ...audit, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .get(
            '/deployment-secrets',
            describeRoute({
                responses: { 200: { description: '배포 secret 목록' } },
                summary: '배포 secret 목록 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context) => {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, SECRET_ROLES)
                }
                return context.json(successResponse(await deploymentSecretService.list()), 200)
            }),
        )
        .post(
            '/deployment-secrets',
            describeRoute({
                responses: { 201: { description: '배포 secret 저장' } },
                summary: '배포 secret 저장',
                tags: ['Deployment'],
            }),
            validator('json', deploymentSecretUpsertSchema),
            withErrorHandling(async (context) => {
                const audit = {
                    operation: 'deployment.secret.upsert',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'secret',
                    targetType: 'deployment-secret' as const,
                }
                let actorId: string | undefined
                let authMethod: 'api-key' | 'session' = 'session'
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    actorId = (await authService.requireRecentRole(context.req.raw.headers, SECRET_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                try {
                    const secret = await deploymentSecretService.upsert(actorId, context.req.valid('json' as never))
                    await auditService.record({ ...audit, actorId, authMethod, targetId: secret.id, result: 'success' })
                    return context.json(successResponse(secret), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_SECRET_UPSERT_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .delete(
            '/deployment-secrets/:id',
            describeRoute({
                responses: { 200: { description: '배포 secret 삭제' } },
                summary: '배포 secret 삭제',
                tags: ['Deployment'],
            }),
            validator('param', secretIdParamSchema),
            validator('json', deploymentSecretDeleteSchema),
            withErrorHandling(async (context) => {
                const targetId = (context.req.valid('param' as never) as z.infer<typeof secretIdParamSchema>).id
                const audit = {
                    operation: 'deployment.secret.remove',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'deployment-secret' as const,
                }
                let actorId: string | undefined
                let authMethod: 'api-key' | 'session' = 'session'
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    actorId = (await authService.requireRecentRole(context.req.raw.headers, SECRET_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                try {
                    const removed = await deploymentSecretService.remove(targetId, context.req.valid('json' as never))
                    await auditService.record({ ...audit, actorId, authMethod, result: 'success' })
                    return context.json(successResponse(removed), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_SECRET_REMOVE_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
