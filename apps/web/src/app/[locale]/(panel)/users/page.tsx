import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getManagedUsers } from '@entities/user/user.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { UserWidget } from '@widgets/user/user-widget'

const UsersPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.USER.LIST,
        queryFn: () => (session.isOwner ? getManagedUsers(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([])),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.users')} title={navTranslations('items.users')} />
                <UserWidget currentUserId={session.session.user.id} />
            </div>
        </HydrationBoundary>
    )
}

export default UsersPage
