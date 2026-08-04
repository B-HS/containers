import type { FC } from 'react'
import type { TrafficAnalytics } from '@containers/contracts/traffic'
import { formatBytes } from '@shared/lib/format-bytes'
import { TrafficKpiCard } from '@features/traffic-kpi/traffic-kpi-card'

type TrafficKpiGridProps = {
    analytics: TrafficAnalytics
    labels: {
        bytes: string
        errorRate: string
        latency: string
        requests: string
    }
}

const PERCENT_SCALE = 100
const RATE_FRACTION_DIGITS = 2
const LATENCY_FRACTION_DIGITS = 1

export const TrafficKpiGrid: FC<TrafficKpiGridProps> = ({ analytics, labels }) => (
    <div className="grid gap-px bg-background sm:grid-cols-2 xl:grid-cols-4">
        <TrafficKpiCard label={labels.requests} value={analytics.requestCount.toString()} />
        <TrafficKpiCard label={labels.errorRate} value={`${(analytics.errorRate * PERCENT_SCALE).toFixed(RATE_FRACTION_DIGITS)}%`} />
        <TrafficKpiCard
            hint={`P50 ${analytics.latency.p50Ms.toFixed(LATENCY_FRACTION_DIGITS)} · P99 ${analytics.latency.p99Ms.toFixed(LATENCY_FRACTION_DIGITS)} ms`}
            label={`${labels.latency} P95`}
            value={`${analytics.latency.p95Ms.toFixed(LATENCY_FRACTION_DIGITS)} ms`}
        />
        <TrafficKpiCard label={labels.bytes} value={formatBytes(analytics.bytesSent)} />
    </div>
)
