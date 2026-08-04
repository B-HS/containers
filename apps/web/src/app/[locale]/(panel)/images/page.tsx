import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getImages } from '@entities/image/image.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ImageWidget } from '@widgets/image/image-widget'

const ImagesPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.IMAGE.LIST,
        queryFn: () => getImages(API_INTERNAL_URL, session.cookie).catch(() => []),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.images')} title={navTranslations('items.images')} />
                <ImageWidget role={session.session.role} />
            </div>
        </HydrationBoundary>
    )
}

export default ImagesPage
