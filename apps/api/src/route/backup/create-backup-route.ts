import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { backupCreateSchema, backupIdSchema, backupDeleteSchema, backupRestoreSchema } from '@containers/contracts/backup'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { USER_ROLE } from '@containers/db-schema/schema'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { ApiKeyService } from '../../service/domain/api-key/create-api-key-service'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { BackupService } from '../../service/domain/backup/create-backup-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { OperationJobService } from '../../service/domain/job/create-operation-job-service'

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1_000
const BACKUP_ROLES = [USER_ROLE.OWNER]
const backupIdParamSchema = z.object({ id: backupIdSchema })

type BackupRouteDependencies = {
    apiKeyService: Pick<ApiKeyService, 'authenticate'>
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRecentRole' | 'requireRole'>
    backupService: Pick<BackupService, 'create' | 'list' | 'remove' | 'stageRestoreSecret'>
    operationJobService: Pick<OperationJobService, 'enqueue'>
}

const sourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createBackupRoute = ({ apiKeyService, auditService, authService, backupService, operationJobService }: BackupRouteDependencies) => {
    const authenticateWrite = async (headers: Headers) => {
        if (headers.has('authorization')) {
            return apiKeyService.authenticate(headers, API_KEY_SCOPE.BACKUP_WRITE)
        }
        const session = await authService.requireRecentRole(headers, BACKUP_ROLES, RECENT_AUTH_MAX_AGE_MS)
        return { actorId: session.user.id, authMethod: 'session' as const }
    }

    const authenticateRestore = async (headers: Headers) => {
        if (headers.has('authorization')) {
            throw createAppError('FORBIDDEN')
        }
        const session = await authService.requireRecentRole(headers, BACKUP_ROLES, RECENT_AUTH_MAX_AGE_MS)
        return { actorId: session.user.id, authMethod: 'session' as const }
    }

    return new Hono()
        .get(
            '/backups',
            describeRoute({
                responses: { 200: { description: '백업 목록' } },
                summary: '백업 목록 조회',
                tags: ['Backup'],
            }),
            withErrorHandling(async (context) => {
                if (context.req.raw.headers.has('authorization')) {
                    await apiKeyService.authenticate(context.req.raw.headers, API_KEY_SCOPE.BACKUP_READ)
                } else {
                    await authService.requireRole(context.req.raw.headers, BACKUP_ROLES)
                }
                return context.json(successResponse(await backupService.list()), 200)
            }),
        )
        .post(
            '/backups',
            describeRoute({
                responses: { 201: { description: '백업 생성' } },
                summary: '백업 생성',
                tags: ['Backup'],
            }),
            validator('json', backupCreateSchema),
            withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof backupCreateSchema> }>) => {
                const audit = {
                    operation: 'backup.create',
                    requestId: context.get('requestId'),
                    sourceIp: sourceIp(context.req.raw.headers),
                    targetId: 'new',
                    targetType: 'backup' as const,
                }
                const principal = await authenticateWrite(context.req.raw.headers)
                await auditService.record({ ...audit, ...principal, result: 'attempt' })
                try {
                    const result = await backupService.create(context.req.valid('json'))
                    await auditService.record({ ...audit, ...principal, result: 'success' })
                    return context.json(successResponse(result), 201)
                } catch (error) {
                    const code = error instanceof Error ? error.message : 'BACKUP_OPERATION_FAILED'
                    await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                    throw error
                }
            }),
        )
        .post(
            '/backups/:id/restore',
            describeRoute({
                responses: { 202: { description: '백업 복원' } },
                summary: '백업 복원',
                tags: ['Backup'],
            }),
            validator('param', backupIdParamSchema),
            validator('json', backupRestoreSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof backupIdParamSchema>; json: z.infer<typeof backupRestoreSchema> }>) => {
                    const audit = {
                        operation: 'backup.restore',
                        requestId: context.get('requestId'),
                        sourceIp: sourceIp(context.req.raw.headers),
                        targetId: 'backup',
                        targetType: 'backup' as const,
                    }
                    const principal = await authenticateRestore(context.req.raw.headers)
                    const backupId = context.req.valid('param').id
                    const payload = context.req.valid('json')
                    await auditService.record({ ...audit, ...principal, result: 'attempt' })
                    try {
                        if (payload.confirmation !== backupId) {
                            throw createAppError('CONFIRMATION_MISMATCH')
                        }
                        if (payload.passphrase !== null) {
                            backupService.stageRestoreSecret(backupId, payload.passphrase)
                        }
                        const job = await operationJobService.enqueue({
                            createdBy: principal.actorId,
                            kind: OPERATION_JOB_KIND.BACKUP_RESTORE,
                            maxAttempts: 1,
                            payload: { backupId, confirmation: payload.confirmation, mode: payload.mode },
                            unique: true,
                        })
                        if (job.payload.backupId !== backupId) {
                            throw createAppError('BACKUP_RESTORE_IN_PROGRESS')
                        }
                        await auditService.record({ ...audit, ...principal, result: 'success' })
                        return context.json(successResponse(job), 202)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'BACKUP_OPERATION_FAILED'
                        await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                        throw error
                    }
                },
            ),
        )
        .delete(
            '/backups/:id',
            describeRoute({
                responses: { 200: { description: '백업 삭제' } },
                summary: '백업 삭제',
                tags: ['Backup'],
            }),
            validator('param', backupIdParamSchema),
            validator('json', backupDeleteSchema),
            withErrorHandling(
                async (context: ApiRouteContext<{ param: z.infer<typeof backupIdParamSchema>; json: z.infer<typeof backupDeleteSchema> }>) => {
                    const audit = {
                        operation: 'backup.remove',
                        requestId: context.get('requestId'),
                        sourceIp: sourceIp(context.req.raw.headers),
                        targetId: 'backup',
                        targetType: 'backup' as const,
                    }
                    const principal = await authenticateWrite(context.req.raw.headers)
                    const backupId = context.req.valid('param').id
                    const payload = context.req.valid('json')
                    await auditService.record({ ...audit, ...principal, result: 'attempt' })
                    try {
                        const result = await backupService.remove(backupId, payload)
                        await auditService.record({ ...audit, ...principal, result: 'success' })
                        return context.json(successResponse(result), 200)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'BACKUP_OPERATION_FAILED'
                        await auditService.record({ ...audit, ...principal, detail: { code }, result: 'failure' })
                        throw error
                    }
                },
            ),
        )
}
