import { Hono } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { NotificationDeliveryService } from '../../service/domain/notification/create-notification-delivery-service'
import type { NotificationDestinationService } from '../../service/domain/notification/create-notification-destination-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const NOTIFICATION_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type NotificationRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    notificationDeliveryService: Pick<NotificationDeliveryService, 'deliverTest'>
    notificationDestinationService: NotificationDestinationService
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const errorStatus = (code: string) => {
    if (code === 'API_KEY_RATE_LIMITED') return 429 as const
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'NOTIFICATION_DESTINATION_NOT_FOUND') return 404 as const
    if (code === 'CONFIRMATION_MISMATCH') return 409 as const
    if (code === 'NOTIFICATION_DESTINATION_DECRYPTION_FAILED') return 500 as const
    return 400 as const
}

export const createNotificationRoute = ({
    auditService,
    authService,
    notificationDeliveryService,
    notificationDestinationService,
}: NotificationRouteDependencies) =>
    new Hono()
        .get('/notification-destinations', async (context) => {
            try {
                await authService.requireRole(context.req.raw.headers, NOTIFICATION_ROLES)
                return context.json(successResponse(await notificationDestinationService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_LIST_FAILED'
                return context.json(errorResponse(code, '알림 대상을 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/notification-destinations', async (context) => {
            let actorId: string | undefined
            const audit = {
                operation: 'notification.destination.upsert',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId: 'notification-destination',
                targetType: 'notification-destination' as const,
            }
            try {
                actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                const destination = await notificationDestinationService.upsert(actorId, await context.req.json())
                await auditService.record({ ...audit, actorId, authMethod: 'session', targetId: destination.id, result: 'success' })
                return context.json(successResponse(destination), 201)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_UPSERT_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '알림 대상을 저장할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .patch('/notification-destinations/:id', async (context) => {
            const targetId = context.req.param('id')
            let actorId: string | undefined
            const audit = {
                operation: 'notification.destination.enabled',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId,
                targetType: 'notification-destination' as const,
            }
            try {
                actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                const body = await context.req.json().catch(() => null)
                const destination = await notificationDestinationService.setEnabled(targetId, body?.enabled === true)
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                return context.json(successResponse(destination), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_ENABLED_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '알림 대상을 변경할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/notification-destinations/:id/test', async (context) => {
            const targetId = context.req.param('id')
            let actorId: string | undefined
            const audit = {
                operation: 'notification.destination.test',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId,
                targetType: 'notification-destination' as const,
            }
            try {
                actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                const delivery = await notificationDeliveryService.deliverTest(targetId)
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                return context.json(successResponse(delivery), 202)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NOTIFICATION_TEST_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '테스트 알림을 전송할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .delete('/notification-destinations/:id', async (context) => {
            const targetId = context.req.param('id')
            let actorId: string | undefined
            const audit = {
                operation: 'notification.destination.remove',
                requestId: context.get('requestId'),
                sourceIp: getSourceIp(context.req.raw.headers),
                targetId,
                targetType: 'notification-destination' as const,
            }
            try {
                actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                const removed = await notificationDestinationService.remove(targetId, await context.req.json())
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                return context.json(successResponse(removed), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_REMOVE_FAILED'
                if (actorId) {
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '알림 대상을 삭제할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
