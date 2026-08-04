'use client'

import type { ComponentProps, FC } from 'react'
import { OPERATION_JOB_STATUS, type OperationJobStatus } from '@containers/contracts/operation-job'
import { Badge } from '@shared/ui/badge'
import { Spinner } from '@shared/ui/spinner'

const STATUS_VARIANT: Record<OperationJobStatus, ComponentProps<typeof Badge>['variant']> = {
    [OPERATION_JOB_STATUS.CANCELLED]: 'neutral',
    [OPERATION_JOB_STATUS.CANCELLING]: 'attention',
    [OPERATION_JOB_STATUS.FAILED]: 'danger',
    [OPERATION_JOB_STATUS.QUEUED]: 'neutral',
    [OPERATION_JOB_STATUS.RUNNING]: 'attention',
    [OPERATION_JOB_STATUS.SUCCEEDED]: 'success',
}

const PROGRESSING_STATUSES: OperationJobStatus[] = [OPERATION_JOB_STATUS.RUNNING, OPERATION_JOB_STATUS.CANCELLING]

type JobStatusBadgeProps = {
    status: OperationJobStatus
}

export const JobStatusBadge: FC<JobStatusBadgeProps> = ({ status }) => (
    <Badge variant={STATUS_VARIANT[status]}>
        {PROGRESSING_STATUSES.includes(status) ? <Spinner className="size-3" /> : null}
        {status}
    </Badge>
)
