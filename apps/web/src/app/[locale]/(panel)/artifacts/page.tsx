import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getArtifacts } from '@entities/artifact/artifact.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ArtifactWidget } from '@widgets/artifact/artifact-widget'

const ArtifactsPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.ARTIFACT.LIST,
        queryFn: () => getArtifacts(API_INTERNAL_URL, session.cookie),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.artifacts')} title={navTranslations('items.artifacts')} />
                <ArtifactWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default ArtifactsPage
