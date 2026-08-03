'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { MaintenanceStatus } from '@containers/contracts/maintenance'
import type { BackupSchedule, OperationJob } from '@containers/contracts/operation-job'
import { ACTIVE_JOB_STATUSES, jobResponseSchema } from '@entities/job/job.api'
import { formatDateTime } from '@shared/lib/format-date-time'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { InlineAlert } from '@shared/ui/inline-alert'
import { WidgetSection } from '@shared/common/widget-section'

type JobWidgetProps = {
    jobs: OperationJob[]
    labels: {
        attempt: string
        cancel: string
        cancelFailed: string
        empty: string
        finished: string
        interval: string
        lastFailure: string
        lastSuccess: string
        maintenance: string
        nextRun: string
        none: string
        scheduled: string
        title: string
    }
    maintenance: MaintenanceStatus | undefined
    schedule: BackupSchedule | undefined
}

export const JobWidget: FC<JobWidgetProps> = ({ jobs: initialJobs, labels, maintenance, schedule }) => {
    const [jobs, setJobs] = useState(initialJobs)
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()

    const cancel = async (jobId: string) => {
        setBusy(jobId)
        setError(undefined)
        try {
            const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })
            const body: unknown = await response.json()
            if (!response.ok) throw new Error(parseApiError(body, labels.cancelFailed))
            const cancelled = jobResponseSchema.parse(body).data
            setJobs((current) => current.map((job) => (job.id === cancelled.id ? cancelled : job)))
        } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : labels.cancelFailed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection
            id="job-control-title"
            title={labels.title}
            header={
                <div className="flex items-center gap-2">
                    {maintenance?.enabled ? (
                        <Badge className="bg-red-700 text-white">
                            {labels.maintenance}
                            {maintenance.reason === null ? '' : ` (${maintenance.reason})`}
                        </Badge>
                    ) : null}
                    <Badge variant="muted">{jobs.length}</Badge>
                </div>
            }
        >
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {schedule ? (
                <dl className="grid gap-2 border-t border-background p-3 text-xs text-muted-foreground sm:grid-cols-4">
                    <div className="min-w-0">
                        <dt>{labels.interval}</dt>
                        <dd className="mt-1 truncate text-foreground">{schedule.intervalHours}h</dd>
                    </div>
                    <div className="min-w-0">
                        <dt>{labels.nextRun}</dt>
                        <dd className="mt-1 truncate text-foreground">{formatDateTime(schedule.nextRunAt)}</dd>
                    </div>
                    <div className="min-w-0">
                        <dt>{labels.lastSuccess}</dt>
                        <dd className="mt-1 truncate text-foreground">{formatDateTime(schedule.lastSuccessAt) ?? labels.none}</dd>
                    </div>
                    <div className="min-w-0">
                        <dt>{labels.lastFailure}</dt>
                        <dd className="mt-1 truncate text-foreground">
                            {formatDateTime(schedule.lastFailureAt) ?? labels.none}
                            {schedule.lastFailureCode === null ? '' : ` (${schedule.lastFailureCode})`}
                        </dd>
                    </div>
                </dl>
            ) : null}
            {jobs.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background xl:grid-cols-2">
                {jobs.map((job) => (
                    <Card key={job.id} className="min-w-0 gap-3 p-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-semibold">{job.kind}</p>
                                    <Badge variant="muted">{job.status}</Badge>
                                    {job.progressStep === null ? null : <Badge variant="muted">{job.progressStep}</Badge>}
                                </div>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{job.id}</p>
                            </div>
                            {ACTIVE_JOB_STATUSES.includes(job.status) ? (
                                <Button type="button" variant="default" disabled={busy === job.id} onClick={() => void cancel(job.id)}>
                                    {labels.cancel}
                                </Button>
                            ) : null}
                        </div>
                        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                            <div className="min-w-0">
                                <dt>{labels.attempt}</dt>
                                <dd className="mt-1 truncate text-foreground">
                                    {job.attempt}/{job.maxAttempts}
                                    {job.failureCode === null ? '' : ` (${job.failureCode})`}
                                </dd>
                            </div>
                            <div className="min-w-0">
                                <dt>{labels.finished}</dt>
                                <dd className="mt-1 truncate text-foreground">{formatDateTime(job.finishedAt) ?? labels.none}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt>{labels.scheduled}</dt>
                                <dd className="mt-1 truncate text-foreground">{formatDateTime(job.scheduledAt)}</dd>
                            </div>
                        </dl>
                    </Card>
                ))}
            </div>
        </WidgetSection>
    )
}
