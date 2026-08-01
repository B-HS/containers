import { Hono } from 'hono'
import { auditQuerySchema } from '@containers/contracts/audit'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'

type AuditRouteDependencies = {
    auditService: Pick<AuditService, 'list'>
    authService: Pick<AuthService, 'requireRole'>
}

export const createAuditRoute = ({ auditService, authService }: AuditRouteDependencies) =>
    new Hono().get('/audit', async (context) => {
        try {
            await authService.requireRole(context.req.raw.headers, [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.VIEWER, USER_ROLE.AUDITOR])
            return context.json(successResponse(await auditService.list(auditQuerySchema.parse(context.req.query()))), 200)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'AUDIT_UNAVAILABLE'

            if (code === 'AUTH_REQUIRED') {
                return context.json(errorResponse(code, '로그인이 필요합니다.', context.get('requestId')), 401)
            }

            if (code === 'FORBIDDEN') {
                return context.json(errorResponse(code, '감사 기록 조회 권한이 없습니다.', context.get('requestId')), 403)
            }

            return context.json(errorResponse('AUDIT_UNAVAILABLE', '감사 기록을 조회할 수 없습니다.', context.get('requestId')), 503)
        }
    })
