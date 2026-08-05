import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { USER_ROLE } from '@containers/db-schema/schema'
import { managedUserUpdateSchema } from '@containers/contracts/user-management'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

const ownerBootstrapSchema = z.object({
    email: z.email(),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
})

const invitationCreateSchema = z.object({
    email: z.email(),
    expiresInHours: z.number().int().min(1).max(168).default(24),
    role: z.enum([USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]),
})

const invitationAcceptSchema = z.object({
    name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
    token: z.string().min(32).max(256),
})

const USER_ID_MAX_LENGTH = 255

const userIdParamSchema = z.object({ id: z.string().trim().min(1).max(USER_ID_MAX_LENGTH) })

type AuthRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<
        AuthService,
        | 'acceptInvitation'
        | 'bootstrapOwner'
        | 'createInvitation'
        | 'deleteUser'
        | 'getBootstrapStatus'
        | 'getSession'
        | 'getSessionSummary'
        | 'listUsers'
        | 'updateUser'
    >
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createAuthRoute = ({ auditService, authService }: AuthRouteDependencies) =>
    new Hono()
        .get(
            '/bootstrap/status',
            describeRoute({
                responses: { 200: { description: 'bootstrap 상태' } },
                summary: 'bootstrap 상태 조회',
                tags: ['Auth'],
            }),
            withErrorHandling(async (context) => context.json(successResponse(await authService.getBootstrapStatus()), 200)),
        )
        .post(
            '/bootstrap/owner',
            describeRoute({
                responses: { 201: { description: 'owner 계정 생성' } },
                summary: '초기 owner 계정 생성',
                tags: ['Auth'],
            }),
            validator('json', ownerBootstrapSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof ownerBootstrapSchema> }>) =>
                context.json(successResponse(await authService.bootstrapOwner(context.req.valid('json'))), 201),
            ),
        )
        .get(
            '/session',
            describeRoute({
                responses: { 200: { description: '세션 정보' } },
                summary: '현재 세션 조회',
                tags: ['Auth'],
            }),
            withErrorHandling(async (context) => {
                const session = await authService.getSessionSummary(context.req.raw.headers)
                if (!session) {
                    throw createAppError('AUTH_REQUIRED')
                }
                return context.json(successResponse(session), 200)
            }),
        )
        .post(
            '/invitations',
            describeRoute({
                responses: { 201: { description: '초대 생성' } },
                summary: '사용자 초대 생성',
                tags: ['Auth'],
            }),
            validator('json', invitationCreateSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof invitationCreateSchema> }>) => {
                const input = context.req.valid('json')
                const actorId = (await authService.getSession(context.req.raw.headers))?.user.id
                try {
                    const result = await authService.createInvitation(context.req.raw.headers, input)
                    await auditService.record({
                        actorId: result.createdBy,
                        detail: { email: result.email, expiresAt: result.expiresAt, role: result.role },
                        operation: 'invitation.create',
                        requestId: context.get('requestId'),
                        result: 'success',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: result.id,
                        targetType: 'invitation',
                    })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
                    if (actorId) {
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'invitation.create',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: 'new',
                            targetType: 'invitation',
                        })
                    }
                    throw error
                }
            }),
        )
        .post(
            '/invitations/accept',
            describeRoute({
                responses: { 201: { description: '초대 수락' } },
                summary: '초대 수락',
                tags: ['Auth'],
            }),
            validator('json', invitationAcceptSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof invitationAcceptSchema> }>) => {
                const result = await authService.acceptInvitation(context.req.valid('json'))
                await auditService.record({
                    actorId: result.user.id,
                    authMethod: 'invitation',
                    operation: 'invitation.accept',
                    requestId: context.get('requestId'),
                    result: 'success',
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: result.user.id,
                    targetType: 'user',
                })
                return context.json(successResponse(result), 201)
            }),
        )
        .get(
            '/users',
            describeRoute({
                responses: { 200: { description: '사용자 목록' } },
                summary: '사용자 목록 조회',
                tags: ['Auth'],
            }),
            withErrorHandling(async (context) => context.json(successResponse(await authService.listUsers(context.req.raw.headers)), 200)),
        )
        .patch(
            '/users/:id',
            describeRoute({
                responses: { 200: { description: '사용자 변경' } },
                summary: '사용자 정보 변경',
                tags: ['Auth'],
            }),
            validator('param', userIdParamSchema),
            validator('json', managedUserUpdateSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof userIdParamSchema>; json: z.infer<typeof managedUserUpdateSchema> }>) => {
                    const targetId = context.req.valid('param').id
                    const actor = await authService.getSession(context.req.raw.headers)
                    if (!actor) {
                        throw createAppError('AUTH_REQUIRED')
                    }
                    try {
                        const result = await authService.updateUser(context.req.raw.headers, targetId, context.req.valid('json'))
                        await auditService.record({
                            actorId: actor.user.id,
                            detail: { disabled: Boolean(result.disabledAt), role: result.role },
                            operation: 'user.update',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'user',
                        })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
                        await auditService.record({
                            actorId: actor.user.id,
                            detail: { code },
                            operation: 'user.update',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId,
                            targetType: 'user',
                        })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/users/:id',
            describeRoute({
                responses: { 200: { description: '사용자 삭제' } },
                summary: '사용자 삭제',
                tags: ['Auth'],
            }),
            validator('param', userIdParamSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof userIdParamSchema> }>) => {
                const targetId = context.req.valid('param').id
                const actor = await authService.getSession(context.req.raw.headers)
                if (!actor) {
                    throw createAppError('AUTH_REQUIRED')
                }
                const audit = {
                    actorId: actor.user.id,
                    operation: 'user.delete',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'user' as const,
                }
                try {
                    const result = await authService.deleteUser(context.req.raw.headers, targetId)
                    await auditService.record({ ...audit, detail: { email: result.email, role: result.role }, result: 'success' })
                    return context.json(successResponse(result), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
                    await auditService.record({ ...audit, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
