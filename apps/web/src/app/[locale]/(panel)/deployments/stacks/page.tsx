import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getDeploymentStackReleases, getDeploymentStacks } from '@entities/deployment/deployment-stack.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { DeploymentStackWidget } from '@widgets/deployment/deployment-stack-widget'

const DeploymentStacksPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await Promise.all([
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.DEPLOYMENT.STACK.LIST,
            queryFn: () => getDeploymentStacks(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
        queryClient.prefetchQuery({
            queryKey: QUERY_KEY.DEPLOYMENT.STACK.RELEASE.LIST,
            queryFn: () => getDeploymentStackReleases(API_INTERNAL_URL, session.cookie).catch(() => []),
        }),
    ])

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.deploymentStacks')} title={navTranslations('items.deploymentStacks')} />
                <DeploymentStackWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default DeploymentStacksPage
