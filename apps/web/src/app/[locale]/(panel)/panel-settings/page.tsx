import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getPanelSetting } from '@entities/panel-setting/panel-setting.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { PanelSettingWidget } from '@widgets/panel-setting/panel-setting-widget'

const PanelSettingPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    if (session.isOwner) {
        await queryClient.prefetchQuery({
            queryKey: QUERY_KEY.PANEL_SETTING.DETAIL,
            queryFn: () => getPanelSetting(API_INTERNAL_URL, session.cookie),
        })
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.panelSettings')} title={navTranslations('items.panelSettings')} />
                <PanelSettingWidget canManage={session.isOwner} />
            </div>
        </HydrationBoundary>
    )
}

export default PanelSettingPage
