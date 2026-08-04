import { Hono, type Context } from 'hono'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { backupIdSchema, backupRestoreSchema } from '@containers/contracts/backup'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { errorResponse, successResponse } from '../../lib/response'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { BackupService } from '../../service/domain/backup/create-backup-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const BACKUP_ROLES = [USER_ROLE.OWNER]

type BackupRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    backupService: Pick<BackupService, 'create' | 'list' | 'remove'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

const errorStatus = (code: string) => {
    if (code === 'API_KEY_RATE_LIMITED') return 429 as const
    if (code === 'AUTH_REQUIRED' || code === 'RECENT_AUTH_REQUIRED') return 401 as const
    if (code === 'FORBIDDEN') return 403 as const
    if (code === 'BACKUP_NOT_FOUND') return 404 as const
    if (code === 'CONFIRMATION_MISMATCH') return 409 as const
    if (code.startsWith('BACKUP_')) return 422 as const
    return 400 as const
}

export const createBackupRoute = ({ apiKeyService, auditService, authService, backupService, operationJobService }: BackupRouteDependencies) => {
    const authenticateRead = async (headers: Headers) => {
        if (headers.has('authorization')) {
            return apiKeyService.authenticate(headers, API_KEY_SCOPE.BACKUP_READ)
        }
        const session = await authService.requireRole(headers, BACKUP_ROLES)
        return { actorId: session.user.id, authMethod: 'session' as const }
    }
    const authenticateWrite = async (headers: Headers) => {
        if (headers.has('authorization')) {
            return apiKeyService.authenticate(headers, API_KEY_SCOPE.BACKUP_WRITE)
        }
        const session = await authService.requireRecentRole(headers, BACKUP_ROLES, RECENT_AUTH_MAX_AGE_MS)
        return { actorId: session.user.id, authMethod: 'session' as const }
    }
    const mutate = async (context: Context, operation: string, targetId: string, action: (principal: { actorId: string }) => Promise<unknown>) => {
        let principal: { actorId: string; authMethod: 'api-key' | 'session' } | undefined
        const audit = {
            operation,
            requestId: context.get('requestId'),
            sourceIp: sourceIp(context.req.raw.headers),
            targetId,
            targetType: 'backup' as const,
        }
        try {
            principal = await authenticateWrite(context.req.raw.headers)
            await auditService.record({ ...audit, ...principal, result: 'attempt' })
            const result = await action(principal)
            await auditService.record({ ...audit, ...principal, result: 'success' })
            return context.json(successResponse(result), operation === 'backup.create' ? 201 : 200)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'BACKUP_OPERATION_FAILED'
            if (principal) {
                await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
            }
            return context.json(errorResponse(code, '백업 작업을 완료할 수 없습니다.', context.get('requestId')), errorStatus(code))
        }
    }

    return new Hono()
        .get('/backups', async (context) => {
            try {
                await authenticateRead(context.req.raw.headers)
                return context.json(successResponse(await backupService.list()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'BACKUP_LIST_FAILED'
                return context.json(errorResponse(code, '백업 목록을 조회할 수 없습니다.', context.get('requestId')), errorStatus(code))
            }
        })
        .post('/backups', (context) => mutate(context, 'backup.create', 'new', async () => backupService.create(await context.req.json())))
        .post('/backups/:id/restore', (context) =>
            mutate(context, 'backup.restore', context.req.param('id'), async (principal) => {
                const backupId = backupIdSchema.parse(context.req.param('id'))
                const payload = backupRestoreSchema.parse(await context.req.json())
                if (payload.confirmation !== backupId) {
                    throw createAppError('CONFIRMATION_MISMATCH')
                }
                const job = await operationJobService.enqueue({
                    createdBy: principal.actorId,
                    kind: OPERATION_JOB_KIND.BACKUP_RESTORE,
                    maxAttempts: 1,
                    payload: { backupId, confirmation: payload.confirmation },
                    unique: true,
                })
                if (job.payload.backupId !== backupId) {
                    throw createAppError('BACKUP_RESTORE_IN_PROGRESS')
                }
                return job
            }),
        )
        .delete('/backups/:id', (context) =>
            mutate(context, 'backup.remove', context.req.param('id'), async () =>
                backupService.remove(backupIdSchema.parse(context.req.param('id')), await context.req.json()),
            ),
        )
}
