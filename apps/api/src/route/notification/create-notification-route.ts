import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { notificationDestinationDeleteSchema, notificationDestinationUpsertSchema } from '@containers/contracts/notification'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { NotificationDeliveryService } from '../../service/domain/notification/create-notification-delivery-service'
import type { NotificationDestinationService } from '../../service/domain/notification/create-notification-destination-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const NOTIFICATION_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const destinationIdParamSchema = z.object({ id: z.uuid() })
const setEnabledSchema = z.object({ enabled: z.boolean().optional().default(false) })

type NotificationRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    notificationDeliveryService: Pick<NotificationDeliveryService, 'deliverTest'>
    notificationDestinationService: NotificationDestinationService
}

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createNotificationRoute = ({
    auditService,
    authService,
    notificationDeliveryService,
    notificationDestinationService,
}: NotificationRouteDependencies) =>
    new Hono()
        .get(
            '/notification-destinations',
            describeRoute({
                responses: { 200: { description: '알림 대상 목록' } },
                summary: '알림 대상 목록 조회',
                tags: ['Notification'],
            }),
            withErrorHandling(async (context) => {
                await authService.requireRole(context.req.raw.headers, NOTIFICATION_ROLES)
                return context.json(successResponse(await notificationDestinationService.list()), 200)
            }),
        )
        .post(
            '/notification-destinations',
            describeRoute({
                responses: { 201: { description: '알림 대상 저장' } },
                summary: '알림 대상 저장',
                tags: ['Notification'],
            }),
            validator('json', notificationDestinationUpsertSchema),
            withErrorHandling(async (context) => {
                const audit = {
                    operation: 'notification.destination.upsert',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId: 'notification-destination',
                    targetType: 'notification-destination' as const,
                }
                const actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                try {
                    const destination = await notificationDestinationService.upsert(actorId, context.req.valid('json' as never))
                    await auditService.record({ ...audit, actorId, authMethod: 'session', targetId: destination.id, result: 'success' })
                    return context.json(successResponse(destination), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_UPSERT_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .patch(
            '/notification-destinations/:id',
            describeRoute({
                responses: { 200: { description: '알림 대상 활성화 변경' } },
                summary: '알림 대상 활성화 변경',
                tags: ['Notification'],
            }),
            validator('param', destinationIdParamSchema),
            validator('json', setEnabledSchema),
            withErrorHandling(async (context) => {
                const targetId = (context.req.valid('param' as never) as z.infer<typeof destinationIdParamSchema>).id
                const { enabled } = context.req.valid('json' as never) as z.infer<typeof setEnabledSchema>
                const audit = {
                    operation: 'notification.destination.enabled',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'notification-destination' as const,
                }
                const actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                try {
                    const destination = await notificationDestinationService.setEnabled(targetId, enabled)
                    await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                    return context.json(successResponse(destination), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_ENABLED_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .post(
            '/notification-destinations/:id/test',
            describeRoute({
                responses: { 202: { description: '테스트 알림 전송' } },
                summary: '테스트 알림 전송',
                tags: ['Notification'],
            }),
            validator('param', destinationIdParamSchema),
            withErrorHandling(async (context) => {
                const targetId = (context.req.valid('param' as never) as z.infer<typeof destinationIdParamSchema>).id
                const audit = {
                    operation: 'notification.destination.test',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'notification-destination' as const,
                }
                const actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                try {
                    const delivery = await notificationDeliveryService.deliverTest(targetId)
                    await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                    return context.json(successResponse(delivery), 202)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NOTIFICATION_TEST_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .delete(
            '/notification-destinations/:id',
            describeRoute({
                responses: { 200: { description: '알림 대상 삭제' } },
                summary: '알림 대상 삭제',
                tags: ['Notification'],
            }),
            validator('param', destinationIdParamSchema),
            validator('json', notificationDestinationDeleteSchema),
            withErrorHandling(async (context) => {
                const targetId = (context.req.valid('param' as never) as z.infer<typeof destinationIdParamSchema>).id
                const audit = {
                    operation: 'notification.destination.remove',
                    requestId: context.get('requestId'),
                    sourceIp: getSourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'notification-destination' as const,
                }
                const actorId = (await authService.requireRecentRole(context.req.raw.headers, NOTIFICATION_ROLES, RECENT_AUTH_MAX_AGE_MS)).user.id
                await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'attempt' })
                try {
                    const removed = await notificationDestinationService.remove(targetId, context.req.valid('json' as never))
                    await auditService.record({ ...audit, actorId, authMethod: 'session', result: 'success' })
                    return context.json(successResponse(removed), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'NOTIFICATION_DESTINATION_REMOVE_FAILED'
                    await auditService.record({ ...audit, actorId, authMethod: 'session', detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
