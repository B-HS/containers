import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getApiHealth } from '@entities/health/health.api'
import { apiHealthQueryOptions } from '@entities/health/health.query'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getNginxStatus } from '@entities/nginx/nginx.api'
import { nginxStatusQueryOptions } from '@entities/nginx/nginx.query'
import { getTrafficSummary, getTrafficAnalytics } from '@entities/traffic/traffic.api'
import { trafficAnalyticsQueryOptions, trafficSummaryQueryOptions } from '@entities/traffic/traffic.query'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { OverviewWidget } from '@widgets/overview/overview-widget'
import { TrafficWidget } from '@widgets/traffic/traffic-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'
const BYTE_GIB = 1_073_741_824

const formatGib = (bytes: number) => `${(bytes / BYTE_GIB).toFixed(1)} GiB`

const OverviewPage = async () => {
    const [translations, session] = await Promise.all([getTranslations('Dashboard'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const cookie = session.cookie
    const queryClient = new QueryClient()
    const [apiAvailable, engineDashboard, trafficSummary, trafficAnalytics, nginxStatus] = await Promise.all([
        getApiHealth(API_INTERNAL_URL).then(
            () => {
                queryClient.setQueryData(apiHealthQueryOptions().queryKey, { status: 'ok' })
                return true
            },
            () => false,
        ),
        getEngineDashboard(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficSummary(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficAnalytics(API_INTERNAL_URL, cookie).catch(() => undefined),
        getNginxStatus(API_INTERNAL_URL, cookie).catch(() => undefined),
    ])
    if (engineDashboard) {
        queryClient.setQueryData(['engine', 'overview'], engineDashboard.overview)
        queryClient.setQueryData(['engine', 'container', 'list'], engineDashboard.containers)
    }
    if (trafficSummary) {
        queryClient.setQueryData(trafficSummaryQueryOptions().queryKey, trafficSummary)
    }
    if (trafficAnalytics) {
        queryClient.setQueryData(trafficAnalyticsQueryOptions().queryKey, trafficAnalytics)
    }
    if (nginxStatus) {
        queryClient.setQueryData(nginxStatusQueryOptions().queryKey, nginxStatus)
    }
    const diskValue = engineDashboard
        ? `${formatGib(engineDashboard.overview.disk.usedBytes)} / ${formatGib(engineDashboard.overview.disk.capacityBytes)}`
        : undefined

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={translations('subtitle')} title={translations('heading')} />
                <OverviewWidget
                    apiAvailable={apiAvailable}
                    containerCount={engineDashboard?.containers.length}
                    degradedLabel={translations('degraded')}
                    diskValue={diskValue}
                    engineValue={engineDashboard ? `v${engineDashboard.overview.version}` : undefined}
                    healthyLabel={translations('healthy')}
                    labels={{
                        api: translations('api'),
                        containers: translations('containers'),
                        disk: translations('disk'),
                        engine: translations('engine'),
                        nginx: translations('nginx'),
                        traffic: translations('traffic'),
                    }}
                    nginxValue={nginxStatus ? `${nginxStatus.activeConnections} active` : undefined}
                    trafficValue={trafficSummary ? `${trafficSummary.requestsPerSecond.toFixed(2)} req/s` : undefined}
                />
                <TrafficWidget
                    analytics={trafficAnalytics}
                    canExport={session.canManageApiKeys}
                    labels={{
                        average: translations('trafficAverage'),
                        bytes: translations('trafficBytes'),
                        empty: translations('trafficEmpty'),
                        errorRate: translations('trafficErrorRate'),
                        latency: translations('trafficLatency'),
                        maskedIp: translations('trafficMaskedIp'),
                        path: translations('trafficPath'),
                        pause: translations('trafficLivePause'),
                        recent: translations('trafficRecent'),
                        requests: translations('trafficRequests'),
                        resume: translations('trafficLiveResume'),
                        status: translations('trafficStatus'),
                        title: translations('trafficAnalytics'),
                        topPaths: translations('trafficTopPaths'),
                        download: translations('trafficExportDownload'),
                        exportCsv: translations('trafficExportCsv'),
                        exportFailed: translations('trafficExportFailed'),
                        exportNdjson: translations('trafficExportNdjson'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default OverviewPage
