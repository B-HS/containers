'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
    OPERATION_JOB_STATUS,
    backupScheduleSchema,
    operationJobEventListSchema,
    operationJobListSchema,
    type OperationJob,
    type OperationJobKind,
} from '@containers/contracts/operation-job'
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

export const jobListByKindQueryOptions = (kind: OperationJobKind, enabled: boolean) =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.LIST_BY_KIND(kind),
        queryFn: () => clientFetchData<z.infer<typeof operationJobListSchema>>(`/api/jobs?kind=${encodeURIComponent(kind)}`),
        enabled,
    })

export const jobEventsQueryOptions = (jobId: string, enabled: boolean) =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.EVENTS(jobId),
        queryFn: () => clientFetchData<z.infer<typeof operationJobEventListSchema>>(`/api/jobs/${encodeURIComponent(jobId)}/events`),
        enabled: enabled && jobId.length > 0,
    })

const operationJobDetailQueryOptions = (jobId: string) =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.DETAIL(jobId),
        queryFn: () => clientFetchData<OperationJob>(`/api/jobs/${encodeURIComponent(jobId)}`),
        enabled: jobId.length > 0,
    })

type UseOperationJobPollingParams = {
    failureLabel: string
    onFailed?: (failureCode: string | null) => void | Promise<void>
    onSucceeded?: (result: Record<string, unknown> | null) => void | Promise<void>
}

export const useOperationJobPolling = ({ failureLabel, onFailed, onSucceeded }: UseOperationJobPollingParams) => {
    const [jobId, setJobId] = useState<string>()
    const query = useQuery({
        ...operationJobDetailQueryOptions(jobId ?? ''),
        refetchInterval: (polled) =>
            polled.state.data !== undefined && ACTIVE_JOB_STATUSES.includes(polled.state.data.status) ? POLL_INTERVAL_MS : false,
    })

    const status = query.data?.status
    const result = query.data?.result
    const failureCode = status === OPERATION_JOB_STATUS.FAILED ? (query.data?.failureCode ?? null) : undefined
    const isJobActive = jobId !== undefined && status !== undefined && ACTIVE_JOB_STATUSES.includes(status)

    useEffect(() => {
        if (status === OPERATION_JOB_STATUS.SUCCEEDED) void onSucceeded?.(result ?? null)
        if (status === OPERATION_JOB_STATUS.FAILED) void onFailed?.(failureCode ?? null)
    }, [failureCode, onFailed, onSucceeded, result, status])

    const trackJob = (job: OperationJob) => {
        setJobId(job.id)
    }

    const error = query.isError ? failureLabel : undefined

    return { error, failureCode, isJobActive, jobId, status, trackJob }
}

export const useGetJobs = () => useQuery(jobListQueryOptions())

export const useGetJobsByKind = (kind: OperationJobKind, enabled: boolean) => useQuery(jobListByKindQueryOptions(kind, enabled))

export const useGetJobEvents = (jobId: string, enabled: boolean) => useQuery(jobEventsQueryOptions(jobId, enabled))

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
