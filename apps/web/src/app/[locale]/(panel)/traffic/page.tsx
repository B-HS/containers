import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getTrafficAnalytics } from '@entities/traffic/traffic.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { TrafficAnalyticsWidget } from '@widgets/traffic/traffic-analytics-widget'

const TrafficPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    const analytics = await getTrafficAnalytics(API_INTERNAL_URL, session.cookie).catch(() => undefined)
    if (analytics) {
        queryClient.setQueryData(QUERY_KEY.TRAFFIC.ANALYTICS, analytics)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.traffic')} title={navTranslations('items.traffic')} />
                <TrafficAnalyticsWidget canExport={session.canManageApiKeys} />
            </div>
        </HydrationBoundary>
    )
}

export default TrafficPage
