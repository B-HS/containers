import { Hono, type Context } from 'hono'
import { USER_ROLE } from '@containers/db-schema/schema'
import { errorResponse, successResponse } from '../../lib/response'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { BackupScheduleService } from '../../service/domain/job/create-backup-schedule-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const JOB_ROLES = [USER_ROLE.OWNER, USER_ROLE.ADMIN]

type JobRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    backupScheduleService: Pick<BackupScheduleService, 'getSchedule'>
    operationJobService: Pick<OperationJobService, 'get' | 'list' | 'listEvents' | 'requestCancel'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const errorStatus = (code: string) => {
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'JOB_NOT_FOUND') return 404 as const
    if (code === 'JOB_ALREADY_FINISHED') return 409 as const
    return 400 as const
}

export const createJobRoute = ({ auditService, authService, backupScheduleService, operationJobService }: JobRouteDependencies) => {
    const read = async (context: Context, action: () => Promise<unknown>) => {
        try {
            await authService.requireRole(context.req.raw.headers, JOB_ROLES)
            return context.json(successResponse(await action()), 200)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'JOB_READ_FAILED'
            return context.json(errorResponse(code, '작업 정보를 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
        }
    }

    return new Hono()
        .get('/jobs', (context) => read(context, () => operationJobService.list(context.req.query())))
        .get('/jobs/backup-schedule', (context) => read(context, () => backupScheduleService.getSchedule()))
        .get('/jobs/:id', (context) => read(context, () => operationJobService.get(context.req.param('id'))))
        .get('/jobs/:id/events', (context) => read(context, () => operationJobService.listEvents(context.req.param('id'))))
        .post('/jobs/:id/cancel', async (context) => {
            const targetId = context.req.param('id')
            const audit = {
                operation: 'job.cancel',
                requestId: context.get('requestId'),
                sourceIp: sourceIp(context.req.raw.headers),
                targetId,
                targetType: 'job' as const,
            }
            let principal: { actorId: string; authMethod: 'session' } | undefined
            try {
                const session = await authService.requireRecentRole(context.req.raw.headers, JOB_ROLES, RECENT_AUTH_MAX_AGE_MS)
                principal = { actorId: session.user.id, authMethod: 'session' }
                await auditService.record({ ...audit, ...principal, result: 'attempt' })
                const job = await operationJobService.requestCancel(targetId)
                await auditService.record({ ...audit, ...principal, result: 'success' })
                return context.json(successResponse(job), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'JOB_CANCEL_FAILED'
                if (principal) {
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                }
                return context.json(errorResponse(code, '작업을 취소할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
}
