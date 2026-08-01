import { Hono } from 'hono'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentManifestService } from '../../service/domain/deployment/create-deployment-manifest-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const MANIFEST_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const MANIFEST_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type DeploymentManifestRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentManifestService: DeploymentManifestService
}

const getSourceIp = (headers: Headers) => headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

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
    if (code === 'DEPLOYMENT_MANIFEST_NOT_FOUND') {
        return 404 as const
    }
    if (
        code === 'DEPLOYMENT_IDENTITY_MISMATCH' ||
        code === 'DEPLOYMENT_MANIFEST_VERSION_EXISTS' ||
        code === 'DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND' ||
        code === 'DEPLOYMENT_NETWORK_PROTECTED' ||
        code === 'DEPLOYMENT_ROUTE_PROTECTED_HOSTNAME'
    ) {
        return 409 as const
    }
    return 400 as const
}

export const createDeploymentManifestRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentManifestService,
}: DeploymentManifestRouteDependencies) =>
    new Hono()
        .get('/deployment-manifests', async (context) => {
            try {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, MANIFEST_READ_ROLES)
                }
                return context.json(successResponse(await deploymentManifestService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_MANIFEST_LIST_FAILED'
                return context.json(errorResponse(code, '배포 manifest를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .get('/deployment-manifests/:id', async (context) => {
            try {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, MANIFEST_READ_ROLES)
                }
                return context.json(successResponse(await deploymentManifestService.get(context.req.param('id'))), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_MANIFEST_GET_FAILED'
                return context.json(errorResponse(code, '배포 manifest를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/deployment-manifests', async (context) => {
            let actorId: string | undefined
            let authMethod: 'api-key' | 'session' = 'session'
            const audit = {
                operation: 'deployment.manifest.create',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: 'new',
                targetType: 'deployment-manifest' as const,
            }
            try {
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    const session = await authService.requireRecentRole(context.req.raw.headers, MANIFEST_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
                    actorId = session.user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                const created = await deploymentManifestService.create(actorId, await context.req.json())
                await auditService.record({
                    ...audit,
                    actorId,
                    authMethod,
                    detail: { name: created.name, version: created.version },
                    result: 'success',
                })
                return context.json(successResponse(created), 201)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'DEPLOYMENT_MANIFEST_CREATE_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '배포 manifest를 생성할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
