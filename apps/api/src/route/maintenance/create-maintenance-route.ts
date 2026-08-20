import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { maintenanceUpdateSchema } from '@containers/contracts/maintenance'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { authenticateScopeOrRole } from '../../lib/authenticate-scope-or-role'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { MaintenanceService } from '../../service/domain/maintenance/create-maintenance-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const ALL_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN, USER_ROLE.OPERATOR, USER_ROLE.VIEWER, USER_ROLE.AUDITOR]
const MAINTENANCE_WRITE_ROLES = [USER_ROLE.OWNER]
const DEFAULT_MANUAL_REASON = 'manual'

type MaintenanceRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    maintenanceService: Pick<MaintenanceService, 'disable' | 'enable' | 'getStatus'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createMaintenanceRoute = ({ apiKeyService, auditService, authService, maintenanceService }: MaintenanceRouteDependencies) =>
    new Hono()
        .get(
            '/maintenance',
            describeRoute({
                responses: { 200: { description: 'maintenance 상태' } },
                summary: 'maintenance 상태 조회',
                tags: ['Maintenance'],
            }),
            withErrorHandling(async (context) => {
                await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    roles: ALL_ROLES,
                    scope: API_KEY_SCOPE.MAINTENANCE_READ,
                })
                return context.json(successResponse(maintenanceService.getStatus()), 200)
            }),
        )
        .post(
            '/maintenance',
            describeRoute({
                responses: { 200: { description: 'maintenance 상태 변경' } },
                summary: 'maintenance 상태 변경',
                tags: ['Maintenance'],
            }),
            validator('json', maintenanceUpdateSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof maintenanceUpdateSchema> }>) => {
                const payload = context.req.valid('json')
                const audit = {
                    operation: 'maintenance.update',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: 'maintenance',
                    targetType: 'maintenance' as const,
                }
                const actor = await authenticateScopeOrRole({
                    apiKeyService,
                    authService,
                    headers: context.req.raw.headers,
                    recentMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
                    roles: MAINTENANCE_WRITE_ROLES,
                    scope: API_KEY_SCOPE.MAINTENANCE_WRITE,
                })
                const principal = { actorId: actor.actorId, apiKeyId: actor.apiKeyId, authMethod: actor.authMethod }
                try {
                    await auditService.record({ ...audit, ...principal, detail: { enabled: payload.enabled }, result: 'attempt' })
                    if (payload.enabled) {
                        maintenanceService.enable(payload.reason ?? DEFAULT_MANUAL_REASON, { actorId: actor.actorId })
                    } else {
                        maintenanceService.disable()
                    }
                    await auditService.record({ ...audit, ...principal, detail: { enabled: payload.enabled }, result: 'success' })
                    return context.json(successResponse(maintenanceService.getStatus()), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'MAINTENANCE_UPDATE_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
