'use client'

import type { FC } from 'react'
import { OPERATION_JOB_STATUS } from '@containers/contracts/operation-job'
import { ACTIVE_JOB_STATUSES } from '@entities/job/job.api'
import { useGetJobsPolling } from '@entities/job/job.query'
import { Badge } from '@shared/ui/badge'

type JobActivityBadgeProps = {
    activeLabel: string
    failedLabel: string
}

export const JobActivityBadge: FC<JobActivityBadgeProps> = ({ activeLabel, failedLabel }) => {
    const jobs = useGetJobsPolling(true).data ?? []
    const activeCount = jobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status)).length
    const failedCount = jobs.filter((job) => job.status === OPERATION_JOB_STATUS.FAILED).length

    if (activeCount === 0 && failedCount === 0) {
        return null
    }

    return (
        <span className="flex items-center gap-1">
            {activeCount > 0 ? (
                <Badge aria-label={activeLabel} variant="attention">
                    {activeCount}
                </Badge>
            ) : null}
            {failedCount > 0 ? (
                <Badge aria-label={failedLabel} variant="danger">
                    {failedCount}
                </Badge>
            ) : null}
        </span>
    )
}
