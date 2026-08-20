import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getApiKeys } from '@entities/api-key/api-key.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ApiKeyWidget } from '@widgets/api-key/api-key-widget'

const ApiKeysPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.API_KEY.LIST,
        queryFn: () => (session.canManageApiKeys ? getApiKeys(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([])),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.apiKeys')} title={navTranslations('items.apiKeys')} />
                <ApiKeyWidget isOwner={session.isOwner} />
            </div>
        </HydrationBoundary>
    )
}

export default ApiKeysPage
