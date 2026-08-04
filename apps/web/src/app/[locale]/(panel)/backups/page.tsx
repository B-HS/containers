import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getBackups } from '@entities/backup/backup.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { BackupWidget } from '@widgets/backup/backup-widget'

const BackupsPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    if (session.isOwner) {
        await queryClient.prefetchQuery({
            queryKey: QUERY_KEY.BACKUP.LIST,
            queryFn: () => getBackups(API_INTERNAL_URL, session.cookie),
        })
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.backups')} title={navTranslations('items.backups')} />
                <BackupWidget canManage={session.isOwner} />
            </div>
        </HydrationBoundary>
    )
}

export default BackupsPage
