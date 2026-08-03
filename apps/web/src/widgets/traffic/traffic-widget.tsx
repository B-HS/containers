import type { FC } from 'react'
import type { TrafficAnalytics } from '@containers/contracts/traffic'
import { formatBytes } from '@shared/lib/format-bytes'
import { Badge } from '@shared/ui/badge'
import { Card } from '@shared/ui/card'
import { TrafficLiveTail } from '@features/traffic-live-tail/traffic-live-tail'
import { TrafficExport } from '@features/traffic-export/traffic-export'
import { WidgetSection } from '@shared/common/widget-section'

type TrafficWidgetProps = {
    analytics: TrafficAnalytics | undefined
    canExport: boolean
    labels: {
        average: string
        bytes: string
        empty: string
        errorRate: string
        latency: string
        maskedIp: string
        path: string
        pause: string
        recent: string
        resume: string
        requests: string
        status: string
        title: string
        topPaths: string
        download: string
        exportCsv: string
        exportFailed: string
        exportNdjson: string
    }
}

export const TrafficWidget: FC<TrafficWidgetProps> = ({ analytics, canExport, labels }) => (
    <WidgetSection
        id="traffic-analytics-title"
        title={labels.title}
        header={
            <div className="flex items-center gap-2">
                {canExport ? (
                    <TrafficExport
                        labels={{
                            download: labels.download,
                            exportCsv: labels.exportCsv,
                            exportFailed: labels.exportFailed,
                            exportNdjson: labels.exportNdjson,
                        }}
                    />
                ) : null}
                <Badge variant="muted">60m</Badge>
            </div>
        }
    >
        {!analytics || analytics.requestCount === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
        {analytics && analytics.requestCount > 0 ? (
            <>
                <div className="grid gap-px bg-background sm:grid-cols-2 xl:grid-cols-4">
                    <Card className="gap-1 p-3">
                        <p className="text-xs text-muted-foreground">{labels.requests}</p>
                        <p className="text-lg font-semibold">{analytics.requestCount.toString()}</p>
                    </Card>
                    <Card className="gap-1 p-3">
                        <p className="text-xs text-muted-foreground">{labels.errorRate}</p>
                        <p className="text-lg font-semibold">{(analytics.errorRate * 100).toFixed(2)}%</p>
                    </Card>
                    <Card className="gap-1 p-3">
                        <p className="text-xs text-muted-foreground">{labels.latency}</p>
                        <p className="text-sm font-semibold">
                            P50 {analytics.latency.p50Ms.toFixed(1)} · P95 {analytics.latency.p95Ms.toFixed(1)} · P99{' '}
                            {analytics.latency.p99Ms.toFixed(1)} ms
                        </p>
                    </Card>
                    <Card className="gap-1 p-3">
                        <p className="text-xs text-muted-foreground">{labels.bytes}</p>
                        <p className="text-lg font-semibold">{formatBytes(analytics.bytesSent)}</p>
                    </Card>
                </div>
                <div className="grid gap-px bg-background xl:grid-cols-2">
                    <Card className="min-w-0 gap-3 p-3">
                        <h3 className="text-xs font-semibold">{labels.topPaths}</h3>
                        <div className="grid gap-px bg-background">
                            {analytics.topPaths.map((path) => (
                                <div key={path.uriPath} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 bg-card p-2 text-xs">
                                    <span className="truncate font-mono">{path.uriPath}</span>
                                    <span className="text-muted-foreground">
                                        {path.requestCount} · {labels.average} {path.averageResponseTimeMs.toFixed(1)} ms
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card className="min-w-0 gap-3 p-3">
                        <h3 className="text-xs font-semibold">{labels.status}</h3>
                        <div className="flex flex-wrap gap-px">
                            {analytics.statusCounts.map((item) => (
                                <Badge key={item.status} variant="muted">
                                    {item.status} · {item.count}
                                </Badge>
                            ))}
                        </div>
                    </Card>
                </div>
                <div className="min-w-0 p-3">
                    <h3 className="mb-3 text-xs font-semibold">{labels.recent}</h3>
                    <TrafficLiveTail
                        initialEvents={analytics.events}
                        labels={{
                            latency: labels.latency,
                            maskedIp: labels.maskedIp,
                            path: labels.path,
                            pause: labels.pause,
                            resume: labels.resume,
                            status: labels.status,
                        }}
                    />
                </div>
            </>
        ) : null}
    </WidgetSection>
)
