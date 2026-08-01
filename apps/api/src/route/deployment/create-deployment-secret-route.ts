import { Hono } from 'hono'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentSecretService } from '../../service/domain/deployment/create-deployment-secret-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const SECRET_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type DeploymentSecretRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentSecretService: DeploymentSecretService
}

const getSourceIp = (headers: Headers) => headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

const errorStatus = (code: string) => {
    if (code === 'API_KEY_RATE_LIMITED') return 429 as const
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'DEPLOYMENT_SECRET_NOT_FOUND') return 404 as const
    if (code === 'DEPLOYMENT_SECRET_IN_USE' || code === 'CONFIRMATION_MISMATCH') return 409 as const
    return 400 as const
}

export const createDeploymentSecretRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentSecretService,
}: DeploymentSecretRouteDependencies) =>
    new Hono()
        .get('/deployment-secrets', async (context) => {
            try {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, SECRET_ROLES)
                }
                return context.json(successResponse(await deploymentSecretService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_SECRET_LIST_FAILED'
                return context.json(errorResponse(code, '배포 secret 목록을 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/deployment-secrets', async (context) => {
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            const audit = {
                operation: 'deployment.secret.upsert',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: 'secret',
                targetType: 'deployment-secret' as const,
            }
            try {
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    actorId = (await authService.requireRecentRole(context.req.raw.headers, SECRET_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                const secret = await deploymentSecretService.upsert(actorId, await context.req.json())
                await auditService.record({ ...audit, actorId, authMethod, targetId: secret.id, result: 'success' })
                return context.json(successResponse(secret), 201)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_SECRET_UPSERT_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '배포 secret을 저장할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .delete('/deployment-secrets/:id', async (context) => {
            const targetId = context.req.param('id')
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            const audit = {
                operation: 'deployment.secret.remove',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId,
                targetType: 'deployment-secret' as const,
            }
            try {
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.SECRET_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    actorId = (await authService.requireRecentRole(context.req.raw.headers, SECRET_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                const removed = await deploymentSecretService.remove(targetId, await context.req.json())
                await auditService.record({ ...audit, actorId, authMethod, result: 'success' })
                return context.json(successResponse(removed), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_SECRET_REMOVE_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '배포 secret을 삭제할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
