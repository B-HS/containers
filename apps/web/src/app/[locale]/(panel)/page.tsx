import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getApiHealth } from '@entities/health/health.api'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getNginxStatus } from '@entities/nginx/nginx.api'
import { getTrafficSummary, getTrafficAnalytics } from '@entities/traffic/traffic.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { OverviewWidget } from '@widgets/overview/overview-widget'
import { TrafficWidget } from '@widgets/traffic/traffic-widget'

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
                queryClient.setQueryData(QUERY_KEY.HEALTH.API, { status: 'ok' })
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
        queryClient.setQueryData(QUERY_KEY.TRAFFIC.SUMMARY, trafficSummary)
    }
    if (trafficAnalytics) {
        queryClient.setQueryData(QUERY_KEY.TRAFFIC.ANALYTICS, trafficAnalytics)
    }
    if (nginxStatus) {
        queryClient.setQueryData(QUERY_KEY.NGINX.STATUS, nginxStatus)
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
