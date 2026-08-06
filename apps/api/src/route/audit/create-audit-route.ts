import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { auditQuerySchema } from '@containers/contracts/audit'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { paginatedResponse, successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

type AuditRouteDependencies = {
    auditService: Pick<AuditService, 'list' | 'verifyIntegrity'>
    authService: Pick<AuthService, 'requireRole'>
}

const toUnavailable = (error: unknown) => {
    const code = error instanceof Error ? error.message : ''
    if (code === 'AUTH_REQUIRED' || code === 'FORBIDDEN') {
        return error
    }
    return createAppError('AUDIT_UNAVAILABLE')
}

export const createAuditRoute = ({ auditService, authService }: AuditRouteDependencies) =>
    new Hono()
        .get(
            '/audit/integrity',
            describeRoute({
                responses: { 200: { description: '감사 로그 해시 체인 검증 결과' } },
                summary: '감사 로그 무결성 검증',
                tags: ['Audit'],
            }),
            withErrorHandling(async (context: ApiRouteContext) => {
                await authService.requireRole(context.req.raw.headers, [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.AUDITOR])
                try {
                    return context.json(successResponse(await auditService.verifyIntegrity()), 200)
                } catch (error) {
                    throw toUnavailable(error)
                }
            }),
        )
        .get(
            '/audit',
            describeRoute({
                responses: {
                    200: { description: '감사 로그 목록' },
                },
                summary: '감사 로그 조회',
                tags: ['Audit'],
            }),
            validator('query', auditQuerySchema),
            withErrorHandling(async (context: ApiRouteContext<{ query: z.infer<typeof auditQuerySchema> }>) => {
                await authService.requireRole(context.req.raw.headers, [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.VIEWER, USER_ROLE.AUDITOR])
                try {
                    const page = await auditService.list(context.req.valid('query'))
                    return context.json(paginatedResponse(page.data, page.pagination), 200)
                } catch (error) {
                    throw toUnavailable(error)
                }
            }),
        )
