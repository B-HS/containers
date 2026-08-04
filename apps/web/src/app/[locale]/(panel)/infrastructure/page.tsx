import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { Eraser } from 'lucide-react'
import { Button } from '@shared/ui/button'
import { getInfrastructure } from '@entities/infrastructure/infrastructure.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { InfrastructureWidget } from '@widgets/infrastructure/infrastructure-widget'
import { Link } from '../../../../i18n/navigation'

const InfrastructurePage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.INFRASTRUCTURE.OVERVIEW,
        queryFn: () => getInfrastructure(API_INTERNAL_URL, session.cookie).catch(() => ({ networks: [], volumes: [] })),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader
                    actions={
                        session.canManageApiKeys ? (
                            <Button asChild size="sm" variant="outline">
                                <Link href="/infrastructure/prune">
                                    <Eraser aria-hidden="true" />
                                    {navTranslations('items.prune')}
                                </Link>
                            </Button>
                        ) : null
                    }
                    description={navTranslations('subtitles.infrastructure')}
                    title={navTranslations('items.infrastructure')}
                />
                <InfrastructureWidget
                    role={session.session.role}
                    labels={{
                        cancel: translations('cancel'),
                        confirmation: translations('infrastructureConfirmation'),
                        confirmRemoveTitle: translations('confirmRemoveTitle'),
                        containers: translations('containers'),
                        create: translations('create'),
                        created: translations('created'),
                        driver: translations('infrastructureDriver'),
                        empty: translations('infrastructureEmpty'),
                        failed: translations('infrastructureFailed'),
                        force: translations('force'),
                        gateway: translations('gateway'),
                        internal: translations('internalNetwork'),
                        networkCreate: translations('networkCreate'),
                        networkName: translations('networkName'),
                        networkRemoveImpact: translations('networkRemoveImpact'),
                        networks: translations('networks'),
                        networksEmptyDescription: translations('networksEmptyDescription'),
                        remove: translations('remove'),
                        removed: translations('removed'),
                        size: translations('size'),
                        subnet: translations('subnet'),
                        title: translations('infrastructureControl'),
                        volumeCreate: translations('volumeCreate'),
                        volumeName: translations('volumeName'),
                        volumeRemoveImpact: translations('volumeRemoveImpact'),
                        volumes: translations('volumes'),
                        volumesEmptyDescription: translations('volumesEmptyDescription'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default InfrastructurePage
