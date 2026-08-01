import type { FC } from 'react'
import { ServiceStatusCard } from '@features/service-status-card/service-status-card'

type OverviewWidgetProps = {
    degradedLabel: string
    healthyLabel: string
    labels: {
        api: string
        containers: string
        disk: string
        engine: string
        nginx: string
        traffic: string
    }
    apiAvailable: boolean
    containerCount: number | undefined
    diskValue: string | undefined
    engineValue: string | undefined
    nginxValue: string | undefined
    trafficValue: string | undefined
}

export const OverviewWidget: FC<OverviewWidgetProps> = ({
    apiAvailable,
    containerCount,
    degradedLabel,
    diskValue,
    engineValue,
    healthyLabel,
    labels,
    nginxValue,
    trafficValue,
}) => (
    <section className="grid grid-cols-1 gap-px md:grid-cols-2 xl:grid-cols-3" aria-label="Service status">
        <ServiceStatusCard label={labels.api} status={apiAvailable ? healthyLabel : degradedLabel} value={apiAvailable ? '200' : '—'} />
        <ServiceStatusCard label={labels.engine} status={engineValue === undefined ? degradedLabel : healthyLabel} value={engineValue ?? '—'} />
        <ServiceStatusCard label={labels.nginx} status={nginxValue === undefined ? degradedLabel : healthyLabel} value={nginxValue ?? '—'} />
        <ServiceStatusCard
            label={labels.containers}
            status={containerCount === undefined ? degradedLabel : healthyLabel}
            value={containerCount?.toString() ?? '—'}
        />
        <ServiceStatusCard label={labels.traffic} status={trafficValue === undefined ? degradedLabel : healthyLabel} value={trafficValue ?? '—'} />
        <ServiceStatusCard label={labels.disk} status={diskValue === undefined ? degradedLabel : healthyLabel} value={diskValue ?? '—'} />
    </section>
)
