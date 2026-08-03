import { z } from 'zod'
import {
    backupScheduleSchema,
    operationJobListSchema,
    operationJobSchema,
    OPERATION_JOB_STATUS,
    type OperationJobStatus,
} from '@containers/contracts/operation-job'

const jobListResponseSchema = z.object({ data: operationJobListSchema, success: z.literal(true) })
const backupScheduleResponseSchema = z.object({ data: backupScheduleSchema, success: z.literal(true) })

export const jobResponseSchema = z.object({ data: operationJobSchema, success: z.literal(true) })

export const ACTIVE_JOB_STATUSES: OperationJobStatus[] = [OPERATION_JOB_STATUS.QUEUED, OPERATION_JOB_STATUS.RUNNING, OPERATION_JOB_STATUS.CANCELLING]

export const getJobs = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/jobs`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`작업 목록 조회 실패: ${response.status}`)
    }
    return jobListResponseSchema.parse(await response.json()).data
}

export const getBackupSchedule = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/jobs/backup-schedule`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`backup schedule 조회 실패: ${response.status}`)
    }
    return backupScheduleResponseSchema.parse(await response.json()).data
}
