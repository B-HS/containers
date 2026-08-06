import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { composeStackInputSchema } from '@containers/contracts/deployment-stack'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { DeploymentStackService } from '../../service/domain/deployment/create-deployment-stack-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const STACK_READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const STACK_WRITE_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const stackIdParamSchema = z.object({ id: z.uuid() })

type DeploymentStackRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    deploymentStackService: DeploymentStackService
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
        await authService.requireRole(headers, STACK_READ_ROLES)
    }
}

const authenticateWrite = async (
    headers: Headers,
    apiKeyService: Pick<ApiKeyService, 'authenticate'>,
    authService: Pick<AuthService, 'requireRecentRole'>,
) => {
    if (headers.has('authorization')) {
        const principal = await apiKeyService.authenticate(headers, API_KEY_SCOPE.DEPLOYMENT_WRITE)
        return { actorId: principal.actorId, authMethod: principal.authMethod }
    }
    const session = await authService.requireRecentRole(headers, STACK_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
    return { actorId: session.user.id, authMethod: 'session' as const }
}

export const createDeploymentStackRoute = ({ apiKeyService, auditService, authService, deploymentStackService }: DeploymentStackRouteDependencies) =>
    new Hono()
        .get(
            '/deployment-stacks',
            describeRoute({
                responses: { 200: { description: 'compose 스택 목록' } },
                summary: 'compose 스택 목록 조회',
                tags: ['Deployment'],
            }),
            withErrorHandling(async (context: ApiRouteContext) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                return context.json(successResponse(await deploymentStackService.list()), 200)
            }),
        )
        .get(
            '/deployment-stacks/:id',
            describeRoute({
                responses: { 200: { description: 'compose 스택 상세' } },
                summary: 'compose 스택 상세 조회',
                tags: ['Deployment'],
            }),
            validator('param', stackIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof stackIdParamSchema> }>) => {
                await authenticateRead(context.req.raw.headers, apiKeyService, authService)
                const { id } = context.req.valid('param')
                return context.json(successResponse(await deploymentStackService.get(id)), 200)
            }),
        )
        .post(
            '/deployment-stacks/preview',
            describeRoute({
                responses: { 200: { description: 'compose 변환 미리보기' } },
                summary: 'compose 스택 변환 미리보기',
                tags: ['Deployment'],
            }),
            validator('json', composeStackInputSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof composeStackInputSchema> }>) => {
                await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                return context.json(successResponse(await deploymentStackService.preview(context.req.valid('json'))), 200)
            }),
        )
        .post(
            '/deployment-stacks',
            describeRoute({
                responses: { 201: { description: 'compose 스택 생성' } },
                summary: 'compose 스택 생성',
                tags: ['Deployment'],
            }),
            validator('json', composeStackInputSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof composeStackInputSchema> }>) => {
                const audit = {
                    operation: 'deployment.stack.create',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'new',
                    targetType: 'deployment-stack' as const,
                }
                const { actorId, authMethod } = await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                try {
                    const stack = await deploymentStackService.create(actorId, context.req.valid('json'))
                    await auditService.record({
                        ...audit,
                        actorId,
                        authMethod,
                        detail: { name: stack.name, serviceOrder: stack.serviceOrder, version: stack.version },
                        result: 'success',
                    })
                    return context.json(successResponse(stack), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_STACK_CREATE_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .delete(
            '/deployment-stacks/:id',
            describeRoute({
                responses: { 200: { description: 'compose 스택 삭제' } },
                summary: 'compose 스택 삭제',
                tags: ['Deployment'],
            }),
            validator('param', stackIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof stackIdParamSchema> }>) => {
                const { id } = context.req.valid('param')
                const audit = {
                    operation: 'deployment.stack.delete',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: id,
                    targetType: 'deployment-stack' as const,
                }
                const { actorId, authMethod } = await authenticateWrite(context.req.raw.headers, apiKeyService, authService)
                await auditService.record({ ...audit, actorId, authMethod, result: 'attempt' })
                try {
                    const stack = await deploymentStackService.remove(id)
                    await auditService.record({
                        ...audit,
                        actorId,
                        authMethod,
                        detail: { name: stack.name, version: stack.version },
                        result: 'success',
                    })
                    return context.json(successResponse(stack), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'DEPLOYMENT_STACK_DELETE_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
