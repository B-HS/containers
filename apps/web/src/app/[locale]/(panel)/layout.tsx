import type { ReactNode } from 'react'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { AuthPanelWidget } from '@widgets/auth/auth-panel-widget'
import { getEngineOverview } from '@entities/engine/engine.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getNavigationSections, NAV_SECTIONS } from '@shared/lib/navigation'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PanelShell } from '@widgets/panel-shell/panel-shell'

type PanelLayoutProps = {
    children: ReactNode
}

const PanelLayout = async ({ children }: PanelLayoutProps) => {
    const [translations, authTranslations, session] = await Promise.all([getTranslations('Nav'), getTranslations('Auth'), getSession()])

    if (session.mode !== 'authenticated') {
        return (
            <AuthPanelWidget
                mode={session.mode}
                labels={{
                    email: authTranslations('email'),
                    loginAction: authTranslations('loginAction'),
                    loginDescription: authTranslations('loginDescription'),
                    loginTitle: authTranslations('loginTitle'),
                    name: authTranslations('name'),
                    ownerAction: authTranslations('ownerAction'),
                    ownerDescription: authTranslations('ownerDescription'),
                    ownerLocalOnlyDescription: authTranslations('ownerLocalOnlyDescription'),
                    ownerLocalOnlyTitle: authTranslations('ownerLocalOnlyTitle'),
                    ownerTitle: authTranslations('ownerTitle'),
                    password: authTranslations('password'),
                    pending: authTranslations('pending'),
                    unknownError: authTranslations('unknownError'),
                }}
            />
        )
    }

    const navigation = getNavigationSections(session)
    const queryClient = new QueryClient()
    const engineOverview = await getEngineOverview(API_INTERNAL_URL, session.cookie).catch(() => undefined)

    if (engineOverview) {
        queryClient.setQueryData(QUERY_KEY.ENGINE.OVERVIEW, engineOverview)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <PanelShell
                engineInfoLabels={{
                    cpu: translations('engineCpu'),
                    engine: translations('engine'),
                    memory: translations('engineMemory'),
                    refresh: translations('engineRefresh'),
                    storage: translations('engineStorage'),
                }}
                labels={{
                    brand: translations('brand'),
                    jobActive: translations('jobActiveCount'),
                    jobFailed: translations('jobFailedCount'),
                    logout: authTranslations('logout'),
                    menu: translations('menu'),
                    items: Object.fromEntries(
                        NAV_SECTIONS.flatMap((section) => section.items).map((item) => [item.key, translations(`items.${item.key}`)]),
                    ),
                    sections: Object.fromEntries(NAV_SECTIONS.map((section) => [section.key, translations(`sections.${section.key}`)])),
                }}
                navigation={navigation}
                sessionName={session.session.user.name}
                sessionRole={session.session.role}
            >
                {children}
            </PanelShell>
        </HydrationBoundary>
    )
}

export default PanelLayout
