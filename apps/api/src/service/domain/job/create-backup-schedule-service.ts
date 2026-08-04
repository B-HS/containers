import { backupScheduleSchema, OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import type { OperationJob } from '@containers/contracts/operation-job'
import type { BackupService } from '../backup/create-backup-service'
import type { OperationJobService } from './create-operation-job-service'

const HOUR_MS = 60 * 60 * 1_000
const FAILURE_BACKOFF_BASE_MS = 5 * 60 * 1_000
const FAILURE_BACKOFF_MAX_MS = 6 * HOUR_MS
const FAILURE_LOOKUP_LIMIT = 20

type BackupScheduleServiceDependencies = {
    backupService: Pick<BackupService, 'list'>
    intervalHours: number
    now: () => Date
    operationJobService: Pick<OperationJobService, 'enqueue' | 'list'>
}

const attemptedAt = (job: OperationJob) => Date.parse(job.finishedAt ?? job.startedAt ?? job.createdAt)

const backoffMs = (failureCount: number) => Math.min(FAILURE_BACKOFF_BASE_MS * 2 ** (failureCount - 1), FAILURE_BACKOFF_MAX_MS)

export const createBackupScheduleService = ({ backupService, intervalHours, now, operationJobService }: BackupScheduleServiceDependencies) => {
    const readHistory = async () => {
        const [lastSuccess] = await operationJobService.list({ kind: OPERATION_JOB_KIND.BACKUP_CREATE, limit: 1, status: 'succeeded' })
        const failures = await operationJobService.list({
            kind: OPERATION_JOB_KIND.BACKUP_CREATE,
            limit: FAILURE_LOOKUP_LIMIT,
            status: 'failed',
        })
        const successAt = lastSuccess === undefined ? Number.NEGATIVE_INFINITY : attemptedAt(lastSuccess)
        const consecutiveFailures = failures.filter((failure) => attemptedAt(failure) > successAt)
        return { consecutiveFailures, lastFailure: failures[0], lastSuccess }
    }

    const getNextRunAt = async () => {
        const currentTime = now()
        const { consecutiveFailures, lastFailure } = await readHistory()
        const latestBackup = (await backupService.list())[0]
        const intervalDueAt = latestBackup === undefined ? currentTime.getTime() : Date.parse(latestBackup.createdAt) + intervalHours * HOUR_MS
        const backoffDueAt =
            consecutiveFailures.length === 0 || lastFailure === undefined
                ? Number.NEGATIVE_INFINITY
                : attemptedAt(lastFailure) + backoffMs(consecutiveFailures.length)
        const dueAt = Math.max(intervalDueAt, backoffDueAt)
        return dueAt <= currentTime.getTime() ? currentTime : new Date(dueAt)
    }

    return {
        enqueueIfDue: async () => {
            const nextRunAt = await getNextRunAt()
            if (nextRunAt.getTime() > now().getTime()) {
                return false
            }
            await operationJobService.enqueue({
                kind: OPERATION_JOB_KIND.BACKUP_CREATE,
                payload: { label: 'automatic' },
                unique: true,
            })
            return true
        },
        getSchedule: async () => {
            const { lastFailure, lastSuccess } = await readHistory()
            return backupScheduleSchema.parse({
                intervalHours,
                lastFailureAt: lastFailure?.finishedAt ?? null,
                lastFailureCode: lastFailure?.failureCode ?? null,
                lastSuccessAt: lastSuccess?.finishedAt ?? null,
                nextRunAt: (await getNextRunAt()).toISOString(),
            })
        },
    }
}

export type BackupScheduleService = ReturnType<typeof createBackupScheduleService>
