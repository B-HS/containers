import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getNginxRoutes } from '@entities/nginx/nginx.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { NginxRouteControlWidget } from '@widgets/nginx/nginx-route-control-widget'

const NginxRoutesPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    const [engineDashboard] = await Promise.all([
        getEngineDashboard(API_INTERNAL_URL, session.cookie).catch(() => undefined),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.NGINX.ROUTE.LIST,
            queryFn: () => getNginxRoutes(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
    ])
    if (engineDashboard) {
        queryClient.setQueryData(QUERY_KEY.ENGINE.OVERVIEW, engineDashboard.overview)
        queryClient.setQueryData(QUERY_KEY.ENGINE.CONTAINER.LIST, engineDashboard.containers)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.nginxRoutes')} title={navTranslations('items.nginxRoutes')} />
                <NginxRouteControlWidget
                    containers={
                        engineDashboard?.containers.map((container) => container.names[0]?.replace(/^\//, '') ?? container.id.slice(0, 12)) ?? []
                    }
                    role={session.session.role}
                    labels={{
                        actions: translations('actions'),
                        bodySize: translations('nginxRouteBodySize'),
                        cancel: translations('cancel'),
                        confirmation: translations('nginxRouteConfirmation'),
                        confirmRemoveTitle: translations('confirmRemoveTitle'),
                        container: translations('nginxRouteContainer'),
                        create: translations('create'),
                        created: translations('created'),
                        empty: translations('nginxRouteEmpty'),
                        emptyDescription: translations('nginxRouteEmptyDescription'),
                        failed: translations('nginxRouteFailed'),
                        hostname: translations('nginxRouteHostname'),
                        invalidValue: translations('invalidValue'),
                        path: translations('nginxRoutePath'),
                        port: translations('nginxRoutePort'),
                        protocol: translations('nginxRouteProtocol'),
                        remove: translations('remove'),
                        removed: translations('removed'),
                        removeImpact: translations('nginxRouteRemoveImpact'),
                        routeCreate: translations('nginxRouteCreate'),
                        stripPrefix: translations('nginxRouteStripPrefix'),
                        timeout: translations('nginxRouteTimeout'),
                        title: translations('nginxRouteControl'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default NginxRoutesPage
