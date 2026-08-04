'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useOperationJobPolling } from '@entities/job/job.query'
import { useCreateTrafficExport, useGetTrafficAnalytics } from '@entities/traffic/traffic.query'
import { Badge } from '@shared/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { TrafficExport } from '@features/traffic-export/traffic-export'
import { TrafficKpiGrid } from '@features/traffic-kpi/traffic-kpi-grid'
import { TrafficKpiSkeleton } from '@features/traffic-kpi/traffic-kpi-skeleton'
import { TrafficLiveTail } from '@features/traffic-live-tail/traffic-live-tail'
import { WidgetSection } from '@shared/common/widget-section'

type TrafficAnalyticsWidgetProps = {
    canExport: boolean
}

const LATENCY_FRACTION_DIGITS = 1

const createLiveStream = () => new EventSource('/api/traffic/live?statusClass=all')

export const TrafficAnalyticsWidget: FC<TrafficAnalyticsWidgetProps> = ({ canExport }) => {
    const translations = useTranslations('Dashboard')
    const { data: analytics, isPending } = useGetTrafficAnalytics()
    const createExportMutation = useCreateTrafficExport()
    const { error: jobError, jobId, status, trackJob } = useOperationJobPolling({ failureLabel: translations('trafficExportFailed') })

    const createExport = async (input: { format: 'csv' | 'ndjson'; from: string; to: string }) => {
        const job = await createExportMutation.mutateAsync(input)
        trackJob(job)
        return job
    }

    return (
        <WidgetSection
            id="traffic-analytics-title"
            title={translations('trafficAnalytics')}
            header={
                <div className="flex items-center gap-2">
                    {canExport ? (
                        <TrafficExport
                            createExport={createExport}
                            jobError={jobError}
                            jobId={jobId}
                            labels={{
                                download: translations('trafficExportDownload'),
                                exportCsv: translations('trafficExportCsv'),
                                exportFailed: translations('trafficExportFailed'),
                                exportNdjson: translations('trafficExportNdjson'),
                                exportReady: translations('trafficExportReady'),
                                exportStarted: translations('trafficExportStarted'),
                            }}
                            status={status}
                        />
                    ) : null}
                    <Badge variant="neutral">60m</Badge>
                </div>
            }
        >
            {isPending ? <TrafficKpiSkeleton /> : null}
            {!isPending && (!analytics || analytics.requestCount === 0) ? (
                <Empty className="py-12">
                    <EmptyHeader>
                        <EmptyTitle className="text-base">{translations('trafficEmpty')}</EmptyTitle>
                        <EmptyDescription>{translations('trafficEmptyHint')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {analytics && analytics.requestCount > 0 ? (
                <div className="grid gap-px bg-background">
                    <TrafficKpiGrid
                        analytics={analytics}
                        labels={{
                            bytes: translations('trafficBytes'),
                            errorRate: translations('trafficErrorRate'),
                            latency: translations('trafficLatency'),
                            requests: translations('trafficRequests'),
                        }}
                    />
                    <div className="grid gap-px bg-background xl:grid-cols-2">
                        <section className="min-w-0 bg-surface-1 py-4" aria-label={translations('trafficTopPaths')}>
                            <h3 className="px-4 text-xs font-semibold text-text-muted">{translations('trafficTopPaths')}</h3>
                            <Table className="mt-2 text-xs">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{translations('trafficPath')}</TableHead>
                                        <TableHead className="text-right">{translations('trafficRequests')}</TableHead>
                                        <TableHead className="text-right">{translations('trafficAverage')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analytics.topPaths.map((path) => (
                                        <TableRow key={path.uriPath} className="odd:bg-overlay-subtle">
                                            <TableCell className="max-w-80 truncate font-mono">{path.uriPath}</TableCell>
                                            <TableCell className="text-right">{path.requestCount}</TableCell>
                                            <TableCell className="text-right">
                                                {path.averageResponseTimeMs.toFixed(LATENCY_FRACTION_DIGITS)} ms
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </section>
                        <section className="min-w-0 bg-surface-1 p-4" aria-label={translations('trafficStatus')}>
                            <h3 className="text-xs font-semibold text-text-muted">{translations('trafficStatus')}</h3>
                            <div className="mt-3 flex flex-wrap gap-1">
                                {analytics.statusCounts.map((item) => (
                                    <Badge key={item.status} variant="neutral" className="tabular-nums">
                                        {item.status} · {item.count}
                                    </Badge>
                                ))}
                            </div>
                        </section>
                    </div>
                    <section className="min-w-0 bg-surface-1 p-4" aria-label={translations('trafficRecent')}>
                        <h3 className="mb-3 text-xs font-semibold text-text-muted">{translations('trafficRecent')}</h3>
                        <TrafficLiveTail
                            createLiveStream={createLiveStream}
                            initialEvents={analytics.events}
                            labels={{
                                empty: translations('trafficLiveEmpty'),
                                emptyHint: translations('trafficLiveEmptyHint'),
                                latency: translations('trafficLatency'),
                                maskedIp: translations('trafficMaskedIp'),
                                path: translations('trafficPath'),
                                pause: translations('trafficLivePause'),
                                resume: translations('trafficLiveResume'),
                                status: translations('trafficStatus'),
                            }}
                        />
                    </section>
                </div>
            ) : null}
        </WidgetSection>
    )
}
