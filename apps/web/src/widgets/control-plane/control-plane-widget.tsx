'use client'

import type { FC } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { controlPlaneQueryOptions } from '@entities/control-plane/control-plane.query'
import { ControlPlaneSummaryCard } from '@features/control-plane-summary-card/control-plane-summary-card'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Alert, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'

const SKELETON_CARD_COUNT = 6
const DATABASE_INTEGRITY_OK = 'ok'

type ControlPlaneWidgetProps = {
    canView: boolean
}

export const ControlPlaneWidget: FC<ControlPlaneWidgetProps> = ({ canView }) => {
    const translations = useTranslations('Dashboard')
    const status = useQuery({ ...controlPlaneQueryOptions(), enabled: canView })

    if (!canView) {
        return (
            <WidgetSection id="control-plane-control-title" title={translations('title')}>
                <Alert className="m-6 w-auto">
                    <AlertTitle>{translations('permissionRequired')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    if (status.isPending) {
        return (
            <WidgetSection id="control-plane-control-title" title={translations('title')}>
                <div className="grid gap-px bg-background md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                        <div key={index} className="bg-surface-1 p-5">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-3 h-6 w-16" />
                        </div>
                    ))}
                </div>
            </WidgetSection>
        )
    }

    if (!status.data) {
        return (
            <WidgetSection id="control-plane-control-title" title={translations('title')}>
                <Alert variant="destructive" className="m-6 w-auto">
                    <AlertTitle>{translations('controlPlaneUnavailable')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    const { activeJobCount, databaseIntegrity, lastBackupAt, maintenance, migrations, version } = status.data
    const latestAppliedTag = migrations.applied.at(-1)?.tag

    return (
        <WidgetSection id="control-plane-control-title" title={translations('title')} badge={`${translations('version')} ${version}`}>
            <div className="grid gap-px bg-background md:grid-cols-2 xl:grid-cols-3">
                <ControlPlaneSummaryCard
                    label={translations('databaseIntegrity')}
                    value={
                        <Badge variant={databaseIntegrity.control === DATABASE_INTEGRITY_OK ? 'success' : 'danger'}>
                            {databaseIntegrity.control}
                        </Badge>
                    }
                />
                <ControlPlaneSummaryCard
                    label={translations('maintenance')}
                    value={
                        <Badge variant={maintenance.enabled ? 'attention' : 'neutral'}>
                            {maintenance.enabled ? translations('jobMaintenance') : translations('none')}
                        </Badge>
                    }
                    {...(maintenance.reason === null ? {} : { detail: maintenance.reason })}
                />
                <ControlPlaneSummaryCard
                    label={translations('activeJobs')}
                    value={<Badge variant={activeJobCount === 0 ? 'neutral' : 'attention'}>{activeJobCount}</Badge>}
                />
                <ControlPlaneSummaryCard label={translations('lastBackup')} value={formatDateTime(lastBackupAt) ?? translations('none')} />
                <ControlPlaneSummaryCard
                    label={translations('applied')}
                    value={migrations.applied.length}
                    {...(latestAppliedTag === undefined ? {} : { detail: `${translations('migrations')} · ${latestAppliedTag}` })}
                />
                <ControlPlaneSummaryCard
                    label={translations('pending')}
                    value={<Badge variant={migrations.pending.length === 0 ? 'neutral' : 'attention'}>{migrations.pending.length}</Badge>}
                />
            </div>
        </WidgetSection>
    )
}
