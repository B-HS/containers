import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getContainerList } from '@entities/engine/engine.api'
import { getNginxRoutes } from '@entities/nginx/nginx.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { ScreenRoleNotice } from '@features/screen-role-notice/screen-role-notice'
import { PageHeader } from '@shared/common/page-header'
import { NginxRouteControlWidget } from '@widgets/nginx/nginx-route-control-widget'

const ROUTABLE_NETWORKS = ['containers_edge']

const NginxRoutesPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    const [containers] = await Promise.all([
        getContainerList(API_INTERNAL_URL, session.cookie).catch(() => undefined),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.NGINX.ROUTE.LIST,
            queryFn: () => getNginxRoutes(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
    ])
    if (containers) {
        queryClient.setQueryData(QUERY_KEY.ENGINE.CONTAINER.LIST, containers)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.nginxRoutes')} title={navTranslations('items.nginxRoutes')} />
                <ScreenRoleNotice
                    counterpartHref="/nginx"
                    counterpartLabel={navTranslations('items.nginx')}
                    description={translations('nginxRouteRoleNotice')}
                />
                <NginxRouteControlWidget
                    role={session.session.role}
                    routableNetworks={ROUTABLE_NETWORKS}
                    labels={{
                        actions: translations('actions'),
                        bodySize: translations('nginxRouteBodySize'),
                        cancel: translations('cancel'),
                        confirmation: translations('nginxRouteConfirmation'),
                        confirmationMismatch: translations('confirmationMismatch'),
                        confirmRemoveTitle: translations('confirmRemoveTitle'),
                        container: translations('nginxRouteContainer'),
                        containerUnreachable: translations('nginxRouteContainerUnreachable'),
                        create: translations('create'),
                        created: translations('created'),
                        empty: translations('nginxRouteEmpty'),
                        enabled: translations('nginxRouteEnabled'),
                        emptyDescription: translations('nginxRouteEmptyDescription'),
                        failed: translations('nginxRouteFailed'),
                        hostname: translations('nginxRouteHostname'),
                        invalidValue: translations('invalidValue'),
                        managed: translations('nginxRouteManaged'),
                        managedRemoveWarning: translations('nginxRouteManagedRemoveWarning'),
                        path: translations('nginxRoutePath'),
                        pathMode: translations('nginxRoutePathMode'),
                        pathModeExact: translations('nginxRoutePathModeExact'),
                        pathModePrefix: translations('nginxRoutePathModePrefix'),
                        port: translations('nginxRoutePort'),
                        protocol: translations('nginxRouteProtocol'),
                        remove: translations('remove'),
                        removed: translations('removed'),
                        removeImpact: translations('nginxRouteRemoveImpact'),
                        routeCreate: translations('nginxRouteCreate'),
                        routeEdit: translations('nginxRouteEdit'),
                        save: translations('save'),
                        stripPrefix: translations('nginxRouteStripPrefix'),
                        timeout: translations('nginxRouteTimeout'),
                        updated: translations('nginxRouteUpdated'),
                        title: translations('nginxRouteControl'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default NginxRoutesPage
