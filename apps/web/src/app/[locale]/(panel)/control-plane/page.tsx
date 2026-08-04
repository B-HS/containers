import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getControlPlaneStatus } from '@entities/control-plane/control-plane.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ControlPlaneWidget } from '@widgets/control-plane/control-plane-widget'

const ControlPlanePage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    if (session.canManageApiKeys) {
        await queryClient.prefetchQuery({
            queryKey: QUERY_KEY.CONTROL_PLANE.STATUS,
            queryFn: () => getControlPlaneStatus(API_INTERNAL_URL, session.cookie),
        })
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.controlPlane')} title={navTranslations('items.controlPlane')} />
                <ControlPlaneWidget canView={session.canManageApiKeys} />
            </div>
        </HydrationBoundary>
    )
}

export default ControlPlanePage
