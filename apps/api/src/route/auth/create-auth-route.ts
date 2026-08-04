import { Hono } from 'hono'
import { ZodError } from 'zod'
import { createAppError } from '../../lib/error'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

type AuthRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<
        AuthService,
        'acceptInvitation' | 'bootstrapOwner' | 'createInvitation' | 'getBootstrapStatus' | 'getSession' | 'listUsers' | 'updateUser'
    >
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const getErrorCode = (error: unknown) => {
    if (error instanceof ZodError) {
        return 'VALIDATION_ERROR'
    }

    return error instanceof Error ? error.message : 'UNKNOWN_ERROR'
}

export const createAuthRoute = ({ auditService, authService }: AuthRouteDependencies) =>
    new Hono()
        .get('/bootstrap/status', async (context) => context.json(successResponse(await authService.getBootstrapStatus()), 200))
        .post('/bootstrap/owner', async (context) => {
            try {
                return context.json(successResponse(await authService.bootstrapOwner(await context.req.json())), 201)
            } catch (error) {
                const code = getErrorCode(error)

                if (code === 'BOOTSTRAP_COMPLETE') {
                    return context.json(errorResponse(code, '초기 owner 설정이 이미 완료되었습니다.', context.get('requestId')), 409)
                }

                if (code === 'BOOTSTRAP_BUSY') {
                    return context.json(errorResponse(code, '초기 owner 설정이 진행 중입니다.', context.get('requestId')), 409)
                }

                return context.json(errorResponse(code, '초기 owner 요청이 올바르지 않습니다.', context.get('requestId')), 400)
            }
        })
        .get('/session', async (context) => {
            const session = await authService.getSession(context.req.raw.headers)

            if (!session) {
                return context.json(errorResponse('AUTH_REQUIRED', '로그인이 필요합니다.', context.get('requestId')), 401)
            }

            return context.json(successResponse(session), 200)
        })
        .post('/invitations', async (context) => {
            let actorId: string | undefined
            try {
                actorId = (await authService.getSession(context.req.raw.headers))?.user.id
                const result = await authService.createInvitation(context.req.raw.headers, await context.req.json())
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
                const code = getErrorCode(error)

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

                if (code === 'AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                }

                if (code === 'FORBIDDEN') {
                    return context.json(errorResponse(code, '초대를 생성할 권한이 없습니다.', context.get('requestId')), 403)
                }

                return context.json(errorResponse(code, '초대 요청이 올바르지 않습니다.', context.get('requestId')), 400)
            }
        })
        .post('/invitations/accept', async (context) => {
            try {
                const result = await authService.acceptInvitation(await context.req.json())
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
            } catch (error) {
                const code = getErrorCode(error)

                if (code === 'INVITATION_BUSY') {
                    return context.json(errorResponse(code, '다른 초대 수락이 처리 중입니다.', context.get('requestId')), 409)
                }

                if (code === 'INVITATION_INVALID') {
                    return context.json(errorResponse(code, '초대가 만료되었거나 유효하지 않습니다.', context.get('requestId')), 410)
                }

                return context.json(errorResponse(code, '초대 수락 요청이 올바르지 않습니다.', context.get('requestId')), 400)
            }
        })
        .get('/users', async (context) => {
            try {
                return context.json(successResponse(await authService.listUsers(context.req.raw.headers)), 200)
            } catch (error) {
                const code = getErrorCode(error)
                if (code === 'AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
                }
                return context.json(errorResponse(code, '사용자 목록을 조회할 권한이 없습니다.', context.get('requestId')), 403)
            }
        })
        .patch('/users/:id', async (context) => {
            const actor = await authService.getSession(context.req.raw.headers)
            const targetId = context.req.param('id')
            try {
                if (!actor) {
                    throw createAppError('AUTH_REQUIRED')
                }
                const result = await authService.updateUser(context.req.raw.headers, targetId, await context.req.json())
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
                const code = getErrorCode(error)
                if (actor) {
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
                }
                if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') {
                    return context.json(errorResponse(code, '최근 로그인이 필요합니다.', context.get('requestId')), 401)
                }
                if (code === 'FORBIDDEN') {
                    return context.json(errorResponse(code, '사용자를 변경할 권한이 없습니다.', context.get('requestId')), 403)
                }
                if (code === 'USER_NOT_FOUND') {
                    return context.json(errorResponse(code, '사용자를 찾을 수 없습니다.', context.get('requestId')), 404)
                }
                if (code === 'OWNER_IMMUTABLE') {
                    return context.json(errorResponse(code, 'owner 계정은 변경하거나 비활성화할 수 없습니다.', context.get('requestId')), 409)
                }
                return context.json(errorResponse(code, '사용자 변경 요청이 올바르지 않습니다.', context.get('requestId')), 400)
            }
        })
