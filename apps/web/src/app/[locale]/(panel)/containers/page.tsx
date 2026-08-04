import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { Rocket } from 'lucide-react'
import { Button } from '@shared/ui/button'
import { getContainerList } from '@entities/engine/engine.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ContainerControlWidget } from '@widgets/container/container-control-widget'
import { Link } from '../../../../i18n/navigation'

const ContainersPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const containers = await getContainerList(API_INTERNAL_URL, session.cookie).catch(() => undefined)
    const queryClient = new QueryClient()
    if (containers) {
        queryClient.setQueryData(QUERY_KEY.ENGINE.CONTAINER.LIST, containers)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader
                    actions={
                        <Button asChild size="sm">
                            <Link href="/containers/new">
                                <Rocket aria-hidden="true" />
                                {navTranslations('items.containersNew')}
                            </Link>
                        </Button>
                    }
                    description={navTranslations('subtitles.containers')}
                    title={navTranslations('items.containers')}
                />
                <ContainerControlWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default ContainersPage
