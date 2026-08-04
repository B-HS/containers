import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getImages } from '@entities/image/image.api'
import { getInfrastructure } from '@entities/infrastructure/infrastructure.api'
import { getDeploymentManifests, getDeploymentReleases } from '@entities/deployment/deployment.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { DeploymentWidget } from '@widgets/deployment/deployment-widget'

const DeploymentsPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await Promise.all([
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.IMAGE.LIST,
            queryFn: () => getImages(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.DEPLOYMENT.MANIFEST.LIST,
            queryFn: () => getDeploymentManifests(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.INFRASTRUCTURE.OVERVIEW,
            queryFn: () => getInfrastructure(API_INTERNAL_URL, session.cookie).catch(() => ({ networks: [], volumes: [] })),
        }),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.DEPLOYMENT.RELEASE.LIST,
            queryFn: () => getDeploymentReleases(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
    ])

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.deployments')} title={navTranslations('items.deployments')} />
                <DeploymentWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default DeploymentsPage
