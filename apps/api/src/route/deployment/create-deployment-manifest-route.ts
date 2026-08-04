import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { deploymentManifestInputSchema } from '@containers/contracts/deployment'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentManifestService } from '../../service/domain/deployment/create-deployment-manifest-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const MANIFEST_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const MANIFEST_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const manifestIdParamSchema = z.object({ id: z.uuid() })

type DeploymentManifestRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentManifestService: DeploymentManifestService
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
        await authService.requireRole(headers, MANIFEST_READ_ROLES)
    }
}

export const createDeploymentManifestRoute = ({
    apiKeyService,
    auditService,
    authService,
    deploymentManifestService,
}: DeploymentManifestRouteDependencies) =>
    new Hono()
        .get(
            '/deployment-manifests',
            describeRoute({
                responses: { 200: { description: '배포 manifest 목록' } },
                summary: '배포 manifest 목록 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                return context.json(successResponse(await deploymentManifestService.list()), 200)
            }),
        )
        .get(
            '/deployment-manifests/:id',
            describeRoute({
                responses: { 200: { description: '배포 manifest 상세' } },
                summary: '배포 manifest 상세 조회',
                tags: ['Deployment'],
            }),
            validator('param', manifestIdParamSchema),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                const { id } = context.req.valid('param' as never) as z.infer<typeof manifestIdParamSchema>
                return context.json(successResponse(await deploymentManifestService.get(id)), 200)
            }),
        )
        .post(
            '/deployment-manifests',
            describeRoute({
                responses: { 201: { description: '배포 manifest 생성' } },
                summary: '배포 manifest 생성',
                tags: ['Deployment'],
            }),
            validator('json', deploymentManifestInputSchema),
            withErrorHandling(async (context) => {
                const audit = {
                    operation: 'deployment.manifest.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'new',
                    targetType: 'deployment-manifest' as const,
                }
                let actorId: string | undefined
                let authMethod: 'api-key' | 'session' = 'session'
                if (context.req.raw.headers.has('authorization')) {
                    const principal = await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
                    actorId = principal.actorId
                    authMethod = principal.authMethod
                } else {
                    actorId = (await authService.requireRecentRole(context.req.raw.headers, MANIFEST_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                }
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                try {
                    const created = await deploymentManifestService.create(actorId, context.req.valid('json' as never))
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
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
