import { getTranslations } from 'next-intl/server'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getNginxRoutes } from '@entities/nginx/nginx.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { NginxRouteControlWidget } from '@widgets/nginx/nginx-route-control-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const NginxRoutesPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const [engineDashboard, routes] = await Promise.all([
        getEngineDashboard(API_INTERNAL_URL, session.cookie).catch(() => undefined),
        getNginxRoutes(API_INTERNAL_URL, session.cookie).catch(() => []),
    ])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.nginxRoutes')} title={navTranslations('items.nginxRoutes')} />
            <NginxRouteControlWidget
                containers={engineDashboard?.containers.map((container) => container.names[0]?.replace(/^\//, '') ?? container.id.slice(0, 12)) ?? []}
                role={session.session.role}
                routes={routes}
                labels={{
                    bodySize: translations('nginxRouteBodySize'),
                    confirmation: translations('nginxRouteConfirmation'),
                    container: translations('nginxRouteContainer'),
                    create: translations('create'),
                    empty: translations('nginxRouteEmpty'),
                    failed: translations('nginxRouteFailed'),
                    hostname: translations('nginxRouteHostname'),
                    path: translations('nginxRoutePath'),
                    port: translations('nginxRoutePort'),
                    protocol: translations('nginxRouteProtocol'),
                    remove: translations('remove'),
                    stripPrefix: translations('nginxRouteStripPrefix'),
                    timeout: translations('nginxRouteTimeout'),
                    title: translations('nginxRouteControl'),
                }}
            />
        </div>
    )
}

export default NginxRoutesPage
