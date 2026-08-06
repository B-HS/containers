'use client'

import type { FC } from 'react'
import {
    Activity,
    Archive,
    Bell,
    Container,
    Database,
    DatabaseBackup,
    FileCode,
    Globe,
    Image,
    Key,
    KeyRound,
    Layers,
    LayoutDashboard,
    ListTodo,
    Network,
    Rocket,
    Route,
    ScrollText,
    ServerCog,
    ShieldCheck,
    UserPlus,
    Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { JobActivityBadge } from '@features/job-activity-badge/job-activity-badge'
import type { NavSection } from '@shared/lib/navigation'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@shared/ui/sidebar'
import { Link, usePathname } from '../../i18n/navigation'

const NAV_ICONS: Record<string, LucideIcon> = {
    Activity,
    Archive,
    Bell,
    Container,
    Database,
    DatabaseBackup,
    FileCode,
    Globe,
    Image,
    Key,
    KeyRound,
    Layers,
    LayoutDashboard,
    ListTodo,
    Network,
    Rocket,
    Route,
    ScrollText,
    ServerCog,
    ShieldCheck,
    UserPlus,
    Users,
}

const JOB_NAV_KEY = 'jobs'

type PanelShellNavProps = {
    labels: {
        jobActive: string
        jobFailed: string
        items: Record<string, string>
        sections: Record<string, string>
    }
    navigation: NavSection[]
}

const isPathMatch = (href: string, pathname: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))

const getActiveItemKey = (pathname: string, navigation: NavSection[]) => {
    const matches = navigation.flatMap((section) => section.items).filter((item) => isPathMatch(item.href, pathname))
    const [mostSpecific] = matches.sort((a, b) => b.href.length - a.href.length)

    return mostSpecific?.key ?? null
}

const NavIcon: FC<{ name: string }> = ({ name }) => {
    const Icon = NAV_ICONS[name]

    if (!Icon) {
        return null
    }

    return <Icon aria-hidden="true" />
}

export const PanelShellNav: FC<PanelShellNavProps> = ({ labels, navigation }) => {
    const { setOpenMobile } = useSidebar()
    const pathname = usePathname()
    const activeItemKey = getActiveItemKey(pathname, navigation)

    return (
        <>
            {navigation.map((section) => (
                <SidebarGroup key={section.key}>
                    <SidebarGroupLabel>{labels.sections[section.key] ?? section.key}</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {section.items.map((item) => {
                                const label = labels.items[item.key] ?? item.key
                                const active = item.key === activeItemKey

                                return (
                                    <SidebarMenuItem key={item.key}>
                                        <SidebarMenuButton asChild isActive={active} tooltip={label}>
                                            <Link aria-current={active ? 'page' : undefined} href={item.href} onClick={() => setOpenMobile(false)}>
                                                <NavIcon name={item.icon} />
                                                <span>{label}</span>
                                                {item.key === JOB_NAV_KEY ? (
                                                    <JobActivityBadge activeLabel={labels.jobActive} failedLabel={labels.jobFailed} />
                                                ) : null}
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            ))}
        </>
    )
}
