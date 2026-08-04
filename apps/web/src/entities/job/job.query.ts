'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { OPERATION_JOB_STATUS, backupScheduleSchema, operationJobListSchema, type OperationJob } from '@containers/contracts/operation-job'
import { ACTIVE_JOB_STATUSES, jobResponseSchema } from '@entities/job/job.api'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const backupScheduleResponseSchema = z.object({ data: backupScheduleSchema, success: z.literal(true) })

const POLL_INTERVAL_MS = 1_000

export const jobListQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.LIST,
        queryFn: () => clientFetchData<z.infer<typeof operationJobListSchema>>('/api/jobs'),
    })

export const backupScheduleQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.BACKUP_SCHEDULE,
        queryFn: async () => backupScheduleResponseSchema.parse(await clientFetch('/api/jobs/backup-schedule')).data,
    })

const operationJobDetailQueryOptions = (jobId: string) =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.DETAIL(jobId),
        queryFn: () => clientFetchData<OperationJob>(`/api/jobs/${encodeURIComponent(jobId)}`),
        enabled: jobId.length > 0,
    })

type UseOperationJobPollingParams = {
    failureLabel: string
    onSucceeded?: () => void | Promise<void>
}

export const useOperationJobPolling = ({ failureLabel, onSucceeded }: UseOperationJobPollingParams) => {
    const [jobId, setJobId] = useState<string>()
    const query = useQuery({
        ...operationJobDetailQueryOptions(jobId ?? ''),
        refetchInterval: POLL_INTERVAL_MS,
    })

    const status = query.data?.status
    const isJobActive = jobId !== undefined && status !== undefined && ACTIVE_JOB_STATUSES.includes(status)

    useEffect(() => {
        if (status !== OPERATION_JOB_STATUS.SUCCEEDED) return
        void onSucceeded?.()
    }, [onSucceeded, status])

    const trackJob = (job: OperationJob) => {
        setJobId(job.id)
    }

    const error = query.isError ? failureLabel : undefined

    return { error, isJobActive, jobId, status, trackJob }
}

export const useGetJobs = () => useQuery(jobListQueryOptions())

export const useGetBackupSchedule = () => useQuery(backupScheduleQueryOptions())

export const useCancelJob = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (jobId: string) =>
            clientFetchData<z.infer<typeof jobResponseSchema>['data']>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
        onSuccess: (job) => {
            queryClient.setQueryData(QUERY_KEY.JOB.DETAIL(job.id), job)
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.JOB.ALL })
        },
    })
}
