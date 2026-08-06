'use client'

import type { FC, ReactNode } from 'react'
import { useSignOut } from '@entities/auth/auth.query'
import type { NavSection } from '@shared/lib/navigation'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger } from '@shared/ui/sidebar'
import { EngineInfo } from '@widgets/engine/engine-info'
import { LogoutButton } from '@features/logout-button/logout-button'
import { PanelShellNav } from '@widgets/panel-shell/panel-shell-nav'

type PanelShellProps = {
    children: ReactNode
    engineInfoLabels: {
        cpu: string
        engine: string
        memory: string
        refresh: string
        storage: string
    }
    labels: {
        brand: string
        jobActive: string
        jobFailed: string
        logout: string
        menu: string
        items: Record<string, string>
        sections: Record<string, string>
    }
    navigation: NavSection[]
    sessionName: string
    sessionRole: string
}

export const PanelShell: FC<PanelShellProps> = ({ children, engineInfoLabels, labels, navigation, sessionName, sessionRole }) => {
    const signOut = useSignOut()

    const signOutHandler = async () => {
        await signOut.mutateAsync()
    }

    return (
        <SidebarProvider>
            <Sidebar collapsible="offcanvas">
                <SidebarHeader>
                    <p className="px-2 py-1 text-sm font-semibold tracking-tight text-text-strong">{labels.brand}</p>
                </SidebarHeader>
                <SidebarContent>
                    <PanelShellNav
                        labels={{ items: labels.items, jobActive: labels.jobActive, jobFailed: labels.jobFailed, sections: labels.sections }}
                        navigation={navigation}
                    />
                </SidebarContent>
                <SidebarFooter className="gap-3 bg-overlay-subtle">
                    <EngineInfo labels={engineInfoLabels} />
                    <div className="grid gap-0.5">
                        <p className="truncate text-sm font-medium text-text-strong">{sessionName}</p>
                        <p className="truncate text-xs text-text-subtle">{sessionRole}</p>
                    </div>
                    <LogoutButton label={labels.logout} onSignOut={signOutHandler} />
                </SidebarFooter>
                <SidebarRail />
            </Sidebar>
            <SidebarInset>
                <header className="flex items-center gap-2 bg-surface-2 px-3 py-2">
                    <SidebarTrigger aria-label={labels.menu} />
                    <p className="text-sm font-semibold tracking-tight md:hidden">{labels.brand}</p>
                </header>
                {children}
            </SidebarInset>
        </SidebarProvider>
    )
}
