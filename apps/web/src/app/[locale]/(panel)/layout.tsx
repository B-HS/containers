import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { AuthPanelWidget } from '@widgets/auth/auth-panel-widget'
import { getNavigationSections } from '@shared/lib/navigation'
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
                    ownerTitle: authTranslations('ownerTitle'),
                    password: authTranslations('password'),
                    pending: authTranslations('pending'),
                    unknownError: authTranslations('unknownError'),
                }}
            />
        )
    }

    const navigation = getNavigationSections(session)

    return (
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
                logout: authTranslations('logout'),
                menu: translations('menu'),
                items: Object.fromEntries(
                    [
                        'apiKeys',
                        'artifacts',
                        'audit',
                        'backups',
                        'containers',
                        'controlPlane',
                        'deploymentSecrets',
                        'deployments',
                        'images',
                        'infrastructure',
                        'invitations',
                        'jobs',
                        'nginx',
                        'nginxRoutes',
                        'notifications',
                        'overview',
                        'registry',
                        'traffic',
                        'users',
                    ].map((key) => [key, translations(`items.${key}`)]),
                ),
                sections: Object.fromEntries(
                    ['administration', 'containers', 'dashboard', 'deployments', 'images', 'infrastructure', 'nginx', 'operations'].map((key) => [
                        key,
                        translations(`sections.${key}`),
                    ]),
                ),
            }}
            navigation={navigation}
            sessionName={session.session.user.name}
            sessionRole={session.session.role}
        >
            {children}
        </PanelShell>
    )
}

export default PanelLayout
