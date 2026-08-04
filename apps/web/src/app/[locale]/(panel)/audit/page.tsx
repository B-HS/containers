import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getAuditEvents } from '@entities/audit/audit.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { AuditWidget } from '@widgets/audit/audit-widget'

const AuditPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.AUDIT.LIST,
        queryFn: () => (session.canViewAudit ? getAuditEvents(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([])),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.audit')} title={navTranslations('items.audit')} />
                <AuditWidget />
            </div>
        </HydrationBoundary>
    )
}

export default AuditPage
