'use client'

import type { FC } from 'react'
import type { ControlPlaneStatus } from '@containers/contracts/control-plane'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Badge } from '@shared/ui/badge'
import { WidgetSection } from '@shared/common/widget-section'

type ControlPlaneWidgetProps = {
    labels: {
        activeJobs: string
        applied: string
        databaseIntegrity: string
        lastBackup: string
        maintenance: string
        none: string
        pending: string
        title: string
        version: string
    }
    status: ControlPlaneStatus
}

export const ControlPlaneWidget: FC<ControlPlaneWidgetProps> = ({ labels, status }) => (
    <WidgetSection
        id="control-plane-control-title"
        title={labels.title}
        badge={
            <>
                {labels.version} {status.version}
            </>
        }
    >
        <dl className="grid gap-px bg-background md:grid-cols-2 xl:grid-cols-3">
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.databaseIntegrity}</dt>
                <dd className="mt-1">
                    <Badge variant={status.databaseIntegrity.control === 'ok' ? undefined : 'muted'}>{status.databaseIntegrity.control}</Badge>
                </dd>
            </div>
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.maintenance}</dt>
                <dd className="mt-1">
                    <Badge variant={status.maintenance.enabled ? 'muted' : undefined}>
                        {status.maintenance.enabled ? labels.maintenance : labels.none}
                    </Badge>
                </dd>
            </div>
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.activeJobs}</dt>
                <dd className="mt-1">
                    <Badge variant={status.activeJobCount === 0 ? 'muted' : undefined}>{status.activeJobCount}</Badge>
                </dd>
            </div>
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.lastBackup}</dt>
                <dd className="mt-1 text-sm">{formatDateTime(status.lastBackupAt) ?? labels.none}</dd>
            </div>
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.applied}</dt>
                <dd className="mt-1 text-sm">{status.migrations.applied.length}</dd>
            </div>
            <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{labels.pending}</dt>
                <dd className="mt-1">
                    {status.migrations.pending.length === 0 ? <Badge variant="muted">0</Badge> : <Badge>{status.migrations.pending.length}</Badge>}
                </dd>
            </div>
        </dl>
    </WidgetSection>
)
