'use client'

import { useEffect, useState } from 'react'
import { OPERATION_JOB_STATUS, type OperationJob, type OperationJobStatus } from '@containers/contracts/operation-job'
import { ACTIVE_JOB_STATUSES, jobResponseSchema } from '@entities/job/job.api'
import { parseApiError } from '@shared/lib/parse-api-error'

const POLL_INTERVAL_MS = 1_000

type UseOperationJobPollingParams = {
    failureLabel: string
    onSucceeded?: () => void | Promise<void>
}

export const useOperationJobPolling = ({ failureLabel, onSucceeded }: UseOperationJobPollingParams) => {
    const [error, setError] = useState<string>()
    const [jobId, setJobId] = useState<string>()
    const [status, setStatus] = useState<OperationJobStatus>()

    const isJobActive = jobId !== undefined && status !== undefined && ACTIVE_JOB_STATUSES.includes(status)

    const trackJob = (job: OperationJob) => {
        setError(undefined)
        setJobId(job.id)
        setStatus(job.status)
    }

    useEffect(() => {
        if (jobId === undefined || status === undefined || !ACTIVE_JOB_STATUSES.includes(status)) return
        const interval = setInterval(() => {
            void fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
                .then(async (response) => {
                    const body: unknown = await response.json()
                    if (!response.ok) throw new Error(parseApiError(body, failureLabel))
                    const job = jobResponseSchema.parse(body).data
                    setStatus(job.status)
                    if (job.status === OPERATION_JOB_STATUS.SUCCEEDED) {
                        await onSucceeded?.()
                    } else if (job.status === OPERATION_JOB_STATUS.FAILED || job.status === OPERATION_JOB_STATUS.CANCELLED) {
                        setError(job.failureCode ?? failureLabel)
                    }
                })
                .catch((pollError) => setError(pollError instanceof Error ? pollError.message : failureLabel))
        }, POLL_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [failureLabel, jobId, onSucceeded, status])

    return { error, isJobActive, jobId, status, trackJob }
}
