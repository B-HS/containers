import { backupScheduleSchema, OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import type { BackupService } from '../backup/create-backup-service'
import type { OperationJobService } from './create-operation-job-service'

const HOUR_MS = 60 * 60 * 1_000

type BackupScheduleServiceDependencies = {
    backupService: Pick<BackupService, 'list'>
    intervalHours: number
    now: () => Date
    operationJobService: Pick<OperationJobService, 'enqueue' | 'list'>
}

export const createBackupScheduleService = ({ backupService, intervalHours, now, operationJobService }: BackupScheduleServiceDependencies) => {
    const getNextRunAt = async () => {
        const latestBackup = (await backupService.list())[0]
        if (!latestBackup) {
            return now()
        }
        const dueAt = new Date(new Date(latestBackup.createdAt).getTime() + intervalHours * HOUR_MS)
        return dueAt.getTime() <= now().getTime() ? now() : dueAt
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
            const jobs = await operationJobService.list({ kind: OPERATION_JOB_KIND.BACKUP_CREATE })
            const lastSuccess = jobs.find((job) => job.status === 'succeeded')
            const lastFailure = jobs.find((job) => job.status === 'failed')
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
