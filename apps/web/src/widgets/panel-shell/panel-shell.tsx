'use client'

import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import {
    Activity,
    Archive,
    Bell,
    Container,
    Database,
    DatabaseBackup,
    Eraser,
    FileCode,
    Image,
    Key,
    KeyRound,
    LayoutDashboard,
    ListTodo,
    Menu,
    Network,
    Rocket,
    Route,
    ScrollText,
    ServerCog,
    UserPlus,
    Users,
    X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EngineInfo } from '@entities/engine/engine-info'
import { LogoutButton } from '@features/logout-button/logout-button'
import { Link, usePathname } from '../../i18n/navigation'

const NAV_ICONS: Record<string, LucideIcon> = {
    Activity,
    Archive,
    Bell,
    Container,
    Database,
    DatabaseBackup,
    Eraser,
    FileCode,
    Image,
    Key,
    KeyRound,
    LayoutDashboard,
    ListTodo,
    Network,
    Rocket,
    Route,
    ScrollText,
    ServerCog,
    UserPlus,
    Users,
}

type PanelShellItem = {
    href: string
    icon: string
    key: string
}

type PanelShellSection = {
    items: PanelShellItem[]
    key: string
}

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
        close: string
        logout: string
        menu: string
        items: Record<string, string>
        sections: Record<string, string>
    }
    navigation: PanelShellSection[]
    sessionName: string
    sessionRole: string
}

const isPathMatch = (href: string, pathname: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))

const getActiveItemKey = (pathname: string, navigation: PanelShellSection[]): string | null => {
    const matches = navigation.flatMap((section) => section.items).filter((item) => isPathMatch(item.href, pathname))

    if (matches.length === 0) {
        return null
    }

    const [mostSpecific] = matches.sort((a, b) => b.href.length - a.href.length)

    return mostSpecific?.key ?? null
}

const NavIcon: FC<{ name: string }> = ({ name }) => {
    const Icon = NAV_ICONS[name]
    if (!Icon) {
        return null
    }
    return <Icon className="size-4 shrink-0" aria-hidden="true" />
}

export const PanelShell: FC<PanelShellProps> = ({ children, engineInfoLabels, labels, navigation, sessionName, sessionRole }) => {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const activeItemKey = getActiveItemKey(pathname, navigation)

    return (
        <div className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[256px_minmax(0,1fr)]">
            <aside className="hidden h-screen border-r border-muted bg-sidebar lg:sticky lg:top-0 lg:flex lg:flex-col">
                <p className="p-2 text-sm font-semibold">{labels.brand}</p>
                <nav className="mt-6 flex-1 overflow-y-auto" aria-label={labels.brand}>
                    {navigation.map((section) => (
                        <div key={section.key} className="mb-6">
                            <p className="px-2 text-xs text-muted-foreground">{labels.sections[section.key]}</p>
                            <ul className="mt-1 grid gap-px">
                                {section.items.map((item) => {
                                    const active = item.key === activeItemKey
                                    return (
                                        <li key={item.key}>
                                            <Link
                                                className={`flex items-center gap-2 px-2 py-2 text-sm ${
                                                    active ? 'bg-foreground text-background' : 'hover:bg-muted'
                                                }`}
                                                href={item.href}
                                            >
                                                <NavIcon name={item.icon} />
                                                <span className="truncate">{labels.items[item.key]}</span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
                <div className="grid gap-2 border-t border-muted pt-3">
                    <div className="px-2">
                        <EngineInfo labels={engineInfoLabels} />
                    </div>
                    <p className="px-2 text-sm font-medium">{sessionName}</p>
                    <p className="px-2 text-xs text-muted-foreground">{sessionRole}</p>
                    <LogoutButton label={labels.logout} />
                </div>
            </aside>
            <div className="flex min-h-screen min-w-0 flex-col lg:hidden">
                <header className="flex items-center justify-between bg-sidebar p-3">
                    <p className="text-sm font-semibold">{labels.brand}</p>
                    <button aria-label={labels.menu} className="bg-foreground p-2 text-background" onClick={() => setOpen(true)} type="button">
                        <Menu className="size-4" aria-hidden="true" />
                    </button>
                </header>
                {open ? (
                    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
                        <button aria-label={labels.close} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} type="button" />
                        <div className="relative z-10 flex h-full w-64 flex-col overflow-y-auto bg-sidebar">
                            <div className="flex items-center justify-between px-2">
                                <p className="text-sm font-semibold">{labels.brand}</p>
                                <button
                                    aria-label={labels.close}
                                    className="bg-foreground p-2 text-background"
                                    onClick={() => setOpen(false)}
                                    type="button"
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            </div>
                            <nav className="mt-6 flex-1" aria-label={labels.brand}>
                                {navigation.map((section) => (
                                    <div key={section.key} className="mb-6">
                                        <p className="px-2 text-xs text-muted-foreground">{labels.sections[section.key]}</p>
                                        <ul className="mt-1 grid gap-px">
                                            {section.items.map((item) => {
                                                const active = item.key === activeItemKey
                                                return (
                                                    <li key={item.key}>
                                                        <Link
                                                            className={`flex items-center gap-2 px-2 py-2 text-sm ${
                                                                active ? 'bg-foreground text-background' : 'hover:bg-muted'
                                                            }`}
                                                            href={item.href}
                                                            onClick={() => setOpen(false)}
                                                        >
                                                            <NavIcon name={item.icon} />
                                                            <span className="truncate">{labels.items[item.key]}</span>
                                                        </Link>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </div>
                                ))}
                            </nav>
                            <div className="grid gap-2 border-t border-muted pt-3">
                                <div className="px-2">
                                    <EngineInfo labels={engineInfoLabels} />
                                </div>
                                <p className="px-2 text-sm font-medium">{sessionName}</p>
                                <p className="px-2 text-xs text-muted-foreground">{sessionRole}</p>
                                <LogoutButton label={labels.logout} />
                            </div>
                        </div>
                    </div>
                ) : null}
                <main className="min-w-0 flex-1">{children}</main>
            </div>
            <main className="hidden min-w-0 lg:block">{children}</main>
        </div>
    )
}
