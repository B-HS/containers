import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getPrunePreview } from '@entities/infrastructure/infrastructure.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { PruneWidget } from '@widgets/prune/prune-widget'

const PrunePage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    const prunePreview = session.canManageApiKeys ? await getPrunePreview(API_INTERNAL_URL, session.cookie).catch(() => undefined) : undefined
    if (prunePreview) {
        queryClient.setQueryData(QUERY_KEY.INFRASTRUCTURE.PRUNE_PREVIEW.DETAIL(false), prunePreview)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.prune')} title={navTranslations('items.prune')} />
                <PruneWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default PrunePage
