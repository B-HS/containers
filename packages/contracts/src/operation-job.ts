import { z } from 'zod'

export const OPERATION_JOB_KIND = {
    BACKUP_CREATE: 'backup.create',
    BACKUP_RESTORE: 'backup.restore',
    IMAGE_PULL: 'image.pull',
    SYSTEM_PRUNE: 'system.prune',
    TRAFFIC_EXPORT: 'traffic.export',
} as const

export const OPERATION_JOB_STATUS = {
    CANCELLED: 'cancelled',
    CANCELLING: 'cancelling',
    FAILED: 'failed',
    QUEUED: 'queued',
    RUNNING: 'running',
    SUCCEEDED: 'succeeded',
} as const

export const operationJobKindSchema = z.enum([
    OPERATION_JOB_KIND.BACKUP_CREATE,
    OPERATION_JOB_KIND.BACKUP_RESTORE,
    OPERATION_JOB_KIND.IMAGE_PULL,
    OPERATION_JOB_KIND.SYSTEM_PRUNE,
    OPERATION_JOB_KIND.TRAFFIC_EXPORT,
])

export const trafficExportFormatSchema = z.enum(['csv', 'ndjson'])
export const trafficExportJobPayloadSchema = z
    .object({
        format: trafficExportFormatSchema,
        from: z.iso.datetime(),
        to: z.iso.datetime(),
    })
    .superRefine((input, context) => {
        const from = new Date(input.from).getTime()
        const to = new Date(input.to).getTime()
        if (to <= from) context.addIssue({ code: 'custom', message: 'to는 from보다 이후여야 합니다.', path: ['to'] })
        if (to - from > 24 * 60 * 60 * 1_000) context.addIssue({ code: 'custom', message: '최대 24시간만 내보낼 수 있습니다.', path: ['to'] })
    })

export const backupRestoreJobPayloadSchema = z.object({
    backupId: z.uuid(),
    confirmation: z.uuid(),
})

export const systemPruneJobPayloadSchema = z.object({
    confirmation: z.literal('DELETE UNUSED RESOURCES'),
    includeVolumes: z.boolean(),
    previewSha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export const operationJobStatusSchema = z.enum([
    OPERATION_JOB_STATUS.CANCELLED,
    OPERATION_JOB_STATUS.CANCELLING,
    OPERATION_JOB_STATUS.FAILED,
    OPERATION_JOB_STATUS.QUEUED,
    OPERATION_JOB_STATUS.RUNNING,
    OPERATION_JOB_STATUS.SUCCEEDED,
])

export const operationJobSchema = z.object({
    attempt: z.number().int().nonnegative(),
    cancelRequestedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    createdBy: z.string().nullable(),
    failureCode: z.string().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    heartbeatAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    kind: operationJobKindSchema,
    maxAttempts: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown()),
    progressStep: z.string().nullable(),
    result: z.record(z.string(), z.unknown()).nullable(),
    scheduledAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    status: operationJobStatusSchema,
    updatedAt: z.iso.datetime(),
})

export const operationJobEventSchema = z.object({
    createdAt: z.iso.datetime(),
    detail: z.record(z.string(), z.unknown()).nullable(),
    event: z.string(),
    id: z.uuid(),
    jobId: z.uuid(),
})

export const operationJobListQuerySchema = z.object({
    kind: operationJobKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    status: operationJobStatusSchema.optional(),
})

export const backupScheduleSchema = z.object({
    intervalHours: z.number().int().positive(),
    lastFailureAt: z.iso.datetime().nullable(),
    lastFailureCode: z.string().nullable(),
    lastSuccessAt: z.iso.datetime().nullable(),
    nextRunAt: z.iso.datetime(),
})

export const operationJobListSchema = z.array(operationJobSchema)
export const operationJobEventListSchema = z.array(operationJobEventSchema)

export type BackupSchedule = z.infer<typeof backupScheduleSchema>
export type OperationJob = z.infer<typeof operationJobSchema>
export type OperationJobEvent = z.infer<typeof operationJobEventSchema>
export type OperationJobKind = z.infer<typeof operationJobKindSchema>
export type OperationJobStatus = z.infer<typeof operationJobStatusSchema>
