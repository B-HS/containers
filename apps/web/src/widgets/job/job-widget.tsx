'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { OPERATION_JOB_STATUS } from '@containers/contracts/operation-job'
import { ACTIVE_JOB_STATUSES } from '@entities/job/job.api'
import { backupScheduleQueryOptions, useCancelJob, useGetJobEvents, useGetJobsPolling } from '@entities/job/job.query'
import { maintenanceQueryOptions } from '@entities/maintenance/maintenance.query'
import { JobCancelDialog } from '@features/job-cancel-dialog/job-cancel-dialog'
import { JobStatusBadge } from '@features/job-status-badge/job-status-badge'
import { SummaryGrid } from '@features/summary-grid/summary-grid'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Alert, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'

const SKELETON_ROW_COUNT = 4

type JobWidgetProps = {
    canManage: boolean
}

export const JobWidget: FC<JobWidgetProps> = ({ canManage }) => {
    const [cancelJobId, setCancelJobId] = useState<string>()
    const [eventsJobId, setEventsJobId] = useState<string>()
    const translations = useTranslations('Dashboard')
    const jobs = useGetJobsPolling(canManage)
    const schedule = useQuery({ ...backupScheduleQueryOptions(), enabled: canManage })
    const maintenance = useQuery({ ...maintenanceQueryOptions(), enabled: canManage })
    const cancelJob = useCancelJob()

    const items = jobs.data ?? []
    const events = useGetJobEvents(eventsJobId ?? '', canManage && eventsJobId !== undefined).data ?? []
    const target = items.find((job) => job.id === cancelJobId)
    const eventsJob = items.find((job) => job.id === eventsJobId)
    const scheduleData = schedule.data

    const cancel = () => {
        if (!target) return
        cancelJob.mutate(target.id, {
            onError: (cancelError) => toast.error(cancelError instanceof Error ? cancelError.message : translations('jobCancelFailed')),
            onSuccess: () => {
                setCancelJobId(undefined)
                toast.success(translations('jobCancelled'))
            },
        })
    }

    if (!canManage) {
        return (
            <WidgetSection id="job-control-title" title={translations('jobControl')}>
                <Alert className="m-6 w-auto">
                    <AlertTitle>{translations('permissionRequired')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection
            id="job-control-title"
            title={translations('jobControl')}
            header={
                <div className="flex items-center gap-2">
                    {maintenance.data?.enabled ? (
                        <Badge variant="danger">
                            {translations('jobMaintenance')}
                            {maintenance.data.reason === null ? '' : ` (${maintenance.data.reason})`}
                        </Badge>
                    ) : null}
                    <Badge variant="neutral">{items.length}</Badge>
                </div>
            }
        >
            {scheduleData ? (
                <SummaryGrid
                    className="bg-surface-3 p-6"
                    items={[
                        { label: translations('jobInterval'), value: `${scheduleData.intervalHours}h` },
                        { label: translations('jobNextRun'), value: formatDateTime(scheduleData.nextRunAt) },
                        { label: translations('jobLastSuccess'), value: formatDateTime(scheduleData.lastSuccessAt) ?? translations('jobNone') },
                        {
                            label: translations('jobLastFailure'),
                            value: `${formatDateTime(scheduleData.lastFailureAt) ?? translations('jobNone')}${
                                scheduleData.lastFailureCode === null ? '' : ` (${scheduleData.lastFailureCode})`
                            }`,
                        },
                    ]}
                />
            ) : null}
            {jobs.isPending ? (
                <div className="grid gap-2 p-6">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            ) : null}
            {!jobs.isPending && items.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{translations('jobEmpty')}</EmptyTitle>
                        <EmptyDescription>{translations('jobEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {items.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{translations('jobKind')}</TableHead>
                            <TableHead>{translations('jobStatus')}</TableHead>
                            <TableHead>{translations('jobAttempt')}</TableHead>
                            <TableHead>
                                {translations('jobScheduled')} · {translations('jobNextRetry')}
                            </TableHead>
                            <TableHead>{translations('jobFinished')}</TableHead>
                            <TableHead className="text-right">{translations('jobCancel')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((job) => (
                            <TableRow key={job.id} className="odd:bg-overlay-subtle">
                                <TableCell className="max-w-64">
                                    <span className="block truncate font-medium text-text-strong">{job.kind}</span>
                                    <span className="block truncate font-mono text-xs text-text-subtle">{job.progressStep ?? job.id}</span>
                                </TableCell>
                                <TableCell>
                                    <JobStatusBadge status={job.status} />
                                </TableCell>
                                <TableCell className={job.status === OPERATION_JOB_STATUS.FAILED ? 'text-danger' : 'text-text-muted'}>
                                    {job.attempt}/{job.maxAttempts}
                                    {job.failureCode === null ? '' : ` (${job.failureCode})`}
                                </TableCell>
                                <TableCell className="text-text-muted">{formatDateTime(job.scheduledAt)}</TableCell>
                                <TableCell className="text-text-muted">{formatDateTime(job.finishedAt) ?? translations('jobNone')}</TableCell>
                                <TableCell className="flex flex-wrap justify-end gap-2 text-right">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => setEventsJobId(eventsJobId === job.id ? undefined : job.id)}
                                    >
                                        {translations('jobEvents')}
                                    </Button>
                                    {ACTIVE_JOB_STATUSES.includes(job.status) ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="text-danger"
                                            onClick={() => setCancelJobId(job.id)}
                                        >
                                            {translations('jobCancel')}
                                        </Button>
                                    ) : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : null}
            {eventsJob ? (
                <section aria-labelledby="job-events-title" className="grid gap-2 bg-surface-1 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-text-strong" id="job-events-title">
                            {translations('jobEvents')} · <span className="font-mono text-xs text-text-muted">{eventsJob.kind}</span>
                        </h3>
                        <Badge variant="neutral">{events.length}</Badge>
                    </div>
                    {events.length === 0 ? <p className="text-xs text-text-subtle">{translations('jobEventsEmpty')}</p> : null}
                    <ol className="grid gap-1">
                        {events.map((event) => (
                            <li className="flex flex-wrap items-baseline gap-2 bg-surface-2 px-3 py-2" key={event.id}>
                                <span className="font-mono text-xs text-text-subtle">{formatDateTime(event.createdAt)}</span>
                                <span className="text-xs font-medium text-text-strong">{event.event}</span>
                                {event.detail === null ? null : (
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">{JSON.stringify(event.detail)}</span>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}
            {target ? (
                <JobCancelDialog
                    open
                    actionLabel={translations('jobCancel')}
                    cancelLabel={translations('cancel')}
                    description={translations('jobCancelDescription')}
                    jobId={target.id}
                    jobKind={target.kind}
                    pending={cancelJob.isPending}
                    title={translations('jobCancelTitle')}
                    onConfirm={cancel}
                    onOpenChange={() => setCancelJobId(undefined)}
                />
            ) : null}
        </WidgetSection>
    )
}
