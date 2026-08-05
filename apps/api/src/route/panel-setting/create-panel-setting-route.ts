import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { panelSettingUpdateSchema } from '@containers/contracts/panel-setting'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { PanelSettingService } from '../../service/domain/panel-setting/create-panel-setting-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const READ_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const WRITE_ROLES = [USER_ROLE.OWNER]

type PanelSettingRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    panelSettingService: Pick<PanelSettingService, 'get' | 'update'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createPanelSettingRoute = ({ auditService, authService, panelSettingService }: PanelSettingRouteDependencies) =>
    new Hono()
        .get(
            '/panel-settings',
            describeRoute({
                responses: { 200: { description: '패널 공개 주소 설정' } },
                summary: '패널 공개 주소 설정 조회',
                tags: ['PanelSetting'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, READ_ROLES)
                return context.json(successResponse(await panelSettingService.get()), 200)
            }),
        )
        .put(
            '/panel-settings',
            describeRoute({
                responses: { 200: { description: '패널 공개 주소 설정 변경' } },
                summary: '패널 공개 주소 설정 변경',
                tags: ['PanelSetting'],
            }),
            validator('json', panelSettingUpdateSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof panelSettingUpdateSchema> }>) => {
                const audit = {
                    operation: 'panel-setting.update',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: 'panel',
                    targetType: 'panel-setting' as const,
                }
                const actorId = (await authService.requireRecentRole(context.req.raw.headers, WRITE_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                const payload = context.req.valid('json')
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                try {
                    const setting = await panelSettingService.update(actorId, payload)
                    await auditService.record({
                        ...audit,
                        actorId,
                        authMethod: 'session',
                        detail: { publicOrigin: setting.publicOrigin, trustedOriginCount: setting.effectiveTrustedOrigins.length },
                        result: 'success',
                    })
                    return context.json(successResponse(setting), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'PANEL_SETTING_UPDATE_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
