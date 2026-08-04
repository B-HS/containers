'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useGetTrafficHealth } from '@entities/traffic/traffic.query'
import { formatBytes } from '@shared/lib/format-bytes'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'

const SKELETON_ROW_COUNT = 4
const PERCENT_SCALE = 100

export const TrafficHealthWidget: FC = () => {
    const translations = useTranslations('Dashboard')
    const { data: health, isPending } = useGetTrafficHealth()

    const ingestion = health?.ingestion
    const retention = health?.retention
    const usageRatio = retention && retention.maxByteSize > 0 ? retention.byteSize / retention.maxByteSize : 0
    const rowRatio = retention && retention.maxRowCount > 0 ? retention.rowCount / retention.maxRowCount : 0
    const hasIngestionFault = Boolean(ingestion && (ingestion.checkpointInodeMissing || ingestion.discardingOversizedLine))

    return (
        <WidgetSection id="traffic-health-title" title={translations('trafficHealth')} notice={translations('trafficHealthNotice')}>
            {isPending ? (
                <div className="grid gap-2 p-6">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_unused, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            ) : null}
            {hasIngestionFault ? (
                <Alert variant="warning" className="m-6 w-auto">
                    <AlertTitle>{translations('trafficIngestionFault')}</AlertTitle>
                    <AlertDescription>{translations('trafficIngestionFaultHint')}</AlertDescription>
                </Alert>
            ) : null}
            {ingestion && retention ? (
                <dl className="grid gap-px bg-background sm:grid-cols-2">
                    <div className="grid gap-1 bg-surface-1 px-6 py-4">
                        <dt className="text-xs tracking-wide text-text-subtle uppercase">{translations('trafficIngestedEvents')}</dt>
                        <dd className="text-lg font-medium tabular-nums text-text-strong">{ingestion.ingestedEventCount.toLocaleString()}</dd>
                        <dd className="text-xs text-text-muted">
                            {translations('trafficInvalidLines')} {ingestion.invalidLineCount.toLocaleString()} ·{' '}
                            {translations('trafficDuplicateLines')} {ingestion.duplicateLineCount.toLocaleString()}
                        </dd>
                    </div>
                    <div className="grid gap-1 bg-surface-1 px-6 py-4">
                        <dt className="text-xs tracking-wide text-text-subtle uppercase">{translations('trafficStoredRows')}</dt>
                        <dd className="text-lg font-medium tabular-nums text-text-strong">
                            {retention.rowCount.toLocaleString()}
                            <span className="ml-2 text-sm text-text-muted">
                                {Math.round(rowRatio * PERCENT_SCALE)}% / {retention.maxRowCount.toLocaleString()}
                            </span>
                        </dd>
                    </div>
                    <div className="grid gap-1 bg-surface-1 px-6 py-4">
                        <dt className="text-xs tracking-wide text-text-subtle uppercase">{translations('trafficDatabaseSize')}</dt>
                        <dd className="text-lg font-medium tabular-nums text-text-strong">
                            {formatBytes(retention.byteSize)}
                            <span className="ml-2 text-sm text-text-muted">
                                {Math.round(usageRatio * PERCENT_SCALE)}% / {formatBytes(retention.maxByteSize)}
                            </span>
                        </dd>
                        <dd className="text-xs text-text-muted">
                            {translations('trafficReclaimable')} {formatBytes(retention.reclaimableByteSize)} · VACUUM{' '}
                            {retention.vacuumCount.toLocaleString()}
                        </dd>
                    </div>
                    <div className="grid gap-1 bg-surface-1 px-6 py-4">
                        <dt className="text-xs tracking-wide text-text-subtle uppercase">{translations('trafficRetentionRemoved')}</dt>
                        <dd className="text-lg font-medium tabular-nums text-text-strong">
                            {(retention.removedByAgeCount + retention.removedByRowLimitCount + retention.removedByByteLimitCount).toLocaleString()}
                        </dd>
                        <dd className="text-xs text-text-muted">
                            {retention.lastRunAt ? formatDateTime(retention.lastRunAt) : translations('trafficRetentionNeverRun')}
                        </dd>
                    </div>
                </dl>
            ) : null}
            {ingestion ? (
                <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-6 py-4">
                    <Badge variant={ingestion.checkpointInodeMissing ? 'danger' : 'neutral'}>
                        {translations('trafficCheckpoint')} {ingestion.checkpointInodeMissing ? 'missing' : 'ok'}
                    </Badge>
                    <Badge variant="neutral">offset {ingestion.offset.toLocaleString()}</Badge>
                    <Badge variant="neutral">inode {ingestion.inode ?? '-'}</Badge>
                </div>
            ) : null}
        </WidgetSection>
    )
}
