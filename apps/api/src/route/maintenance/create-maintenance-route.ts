import { Hono } from 'hono'
import { maintenanceUpdateSchema } from '@containers/contracts/maintenance'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { MaintenanceService } from '../../service/domain/maintenance/create-maintenance-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const MAINTENANCE_WRITE_ROLES = [USER_ROLE.OWNER]
const DEFAULT_MANUAL_REASON = 'manual'

type MaintenanceRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    maintenanceService: Pick<MaintenanceService, 'disable' | 'enable' | 'getStatus'>
}

const sourceIp = (headers: Headers) => headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    return 400 as const
}

export const createMaintenanceRoute = ({ auditService, authService, maintenanceService }: MaintenanceRouteDependencies) =>
    new Hono()
        .get('/maintenance', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, ALL_ROLES)
                return context.json(successResponse(maintenanceService.getStatus()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'MAINTENANCE_READ_FAILED'
                return context.json(errorResponse(code, 'maintenance 상태를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/maintenance', async (context) => {
            const audit = {
                operation: 'maintenance.update',
                requestId: context.get('requestId'),
                sourceIp: sourceIp(context.req.raw.headers),
                targetId: 'maintenance',
                targetType: 'maintenance' as const,
            }
            let principal: { actorId: string; authMethod: 'session' } | undefined
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, MAINTENANCE_WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)
                principal = { actorId: session.user.id, authMethod: 'session' }
                const payload = maintenanceUpdateSchema.parse(await context.req.json())
                await auditService.record({ ...audit, ...principal, detail: { enabled: payload.enabled }, result: 'attempt' })
                if (payload.enabled) {
                    maintenanceService.enable(payload.reason ?? DEFAULT_MANUAL_REASON)
                } else {
                    maintenanceService.disable()
                }
                await auditService.record({ ...audit, ...principal, detail: { enabled: payload.enabled }, result: 'success' })
                return context.json(successResponse(maintenanceService.getStatus()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'MAINTENANCE_UPDATE_FAILED'
                if (principal) {
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, 'maintenance 상태를 변경할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
