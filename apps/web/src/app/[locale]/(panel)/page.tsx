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
import { TrafficSummaryWidget } from '@widgets/traffic/traffic-summary-widget'

const OverviewPage = async () => {
    const [translations, session] = await Promise.all([getTranslations('Dashboard'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const cookie = session.cookie
    const queryClient = new QueryClient()
    const [apiHealth, engineDashboard, trafficSummary, trafficAnalytics, nginxStatus] = await Promise.all([
        getApiHealth(API_INTERNAL_URL).catch(() => undefined),
        getEngineDashboard(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficSummary(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficAnalytics(API_INTERNAL_URL, cookie).catch(() => undefined),
        getNginxStatus(API_INTERNAL_URL, cookie).catch(() => undefined),
    ])
    if (apiHealth) {
        queryClient.setQueryData(QUERY_KEY.HEALTH.API, apiHealth)
    }
    if (engineDashboard) {
        queryClient.setQueryData(QUERY_KEY.ENGINE.OVERVIEW, engineDashboard.overview)
        queryClient.setQueryData(QUERY_KEY.ENGINE.CONTAINER.LIST, engineDashboard.containers)
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

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={translations('subtitle')} title={translations('heading')} />
                <OverviewWidget />
                <TrafficSummaryWidget />
            </div>
        </HydrationBoundary>
    )
}

export default OverviewPage
