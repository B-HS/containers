import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { AUDIT_PAGE_SIZE_DEFAULT } from '@containers/contracts/audit'
import { getTranslations } from 'next-intl/server'
import { AUDIT_DEFAULT_FILTERS, getAuditEvents, toAuditSearchParams } from '@entities/audit/audit.api'
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

    const params = toAuditSearchParams(AUDIT_DEFAULT_FILTERS)
    const emptyPage = { data: [], pagination: { limit: AUDIT_PAGE_SIZE_DEFAULT, page: 1, total: 0, totalPages: 0 } }
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.AUDIT.LIST(params),
        queryFn: () =>
            session.canViewAudit ? getAuditEvents(API_INTERNAL_URL, session.cookie, params).catch(() => emptyPage) : Promise.resolve(emptyPage),
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
