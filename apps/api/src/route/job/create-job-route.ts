import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { operationJobListQuerySchema } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { BackupScheduleService } from '../../service/domain/job/create-backup-schedule-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const JOB_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]
const jobIdSchema = z.object({ id: z.uuid() })

type JobRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRole'>
    backupScheduleService: Pick<BackupScheduleService, 'getSchedule'>
    operationJobService: Pick<OperationJobService, 'get' | 'list' | 'listEvents' | 'requestCancel'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createJobRoute = ({ apiKeyService, auditService, authService, backupScheduleService, operationJobService }: JobRouteDependencies) => {
    const authenticateRead = async (headers: Headers) => {
        if (headers.has('authorization')) {
            await apiKeyService.authenticate(headers, API_KEY_SCOPE.JOB_READ)
            return
        }
        await authService.requireRole(headers, JOB_ROLES)
    }

    const authenticateWrite = async (headers: Headers) => {
        if (headers.has('authorization')) {
            return apiKeyService.authenticate(headers, API_KEY_SCOPE.JOB_WRITE)
        }
        const session = await authService.requireRole(headers, JOB_ROLES)
        return { actorId: session.user.id, authMethod: 'session' as const }
    }

    return new Hono()
        .get(
            '/jobs',
            describeRoute({
                responses: { 200: { description: '작업 목록' } },
                summary: '작업 목록 조회',
                tags: ['Job'],
            }),
            validator('query', operationJobListQuerySchema),
            withErrorHandling(async (context: ApiRouteContext<{ query: z.infer<typeof operationJobListQuerySchema> }>) => {
                await authenticateRead(context.req.raw.headers)
                const query = context.req.valid('query')
                return context.json(successResponse(await operationJobService.list(query)), 200)
            }),
        )
        .get(
            '/jobs/backup-schedule',
            describeRoute({
                responses: { 200: { description: '백업 스케줄' } },
                summary: '백업 스케줄 조회',
                tags: ['Job'],
            }),
            withErrorHandling(async (context) => {
                await authenticateRead(context.req.raw.headers)
                return context.json(successResponse(await backupScheduleService.getSchedule()), 200)
            }),
        )
        .get(
            '/jobs/:id',
            describeRoute({
                responses: { 200: { description: '작업 상세' } },
                summary: '작업 상세 조회',
                tags: ['Job'],
            }),
            validator('param', jobIdSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof jobIdSchema> }>) => {
                await authenticateRead(context.req.raw.headers)
                const { id } = context.req.valid('param')
                return context.json(successResponse(await operationJobService.get(id)), 200)
            }),
        )
        .get(
            '/jobs/:id/events',
            describeRoute({
                responses: { 200: { description: '작업 이벤트' } },
                summary: '작업 이벤트 조회',
                tags: ['Job'],
            }),
            validator('param', jobIdSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof jobIdSchema> }>) => {
                await authenticateRead(context.req.raw.headers)
                const { id } = context.req.valid('param')
                return context.json(successResponse(await operationJobService.listEvents(id)), 200)
            }),
        )
        .post(
            '/jobs/:id/cancel',
            describeRoute({
                responses: { 200: { description: '작업 취소' } },
                summary: '작업 취소',
                tags: ['Job'],
            }),
            validator('param', jobIdSchema),
            withErrorHandling(async (context: ApiRouteContext<{ param: z.infer<typeof jobIdSchema> }>) => {
                const targetId = context.req.valid('param').id
                const audit = {
                    operation: 'job.cancel',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId,
                    targetType: 'job' as const,
                }
                const principal = await authenticateWrite(context.req.raw.headers)
                try {
                    await auditService.record({ ...audit, ...principal, result: 'attempt' })
                    const job = await operationJobService.requestCancel(targetId)
                    await auditService.record({ ...audit, ...principal, result: 'success' })
                    return context.json(successResponse(job), 200)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'JOB_CANCEL_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
}
