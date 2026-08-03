'use client'

import type { FC, ReactNode } from 'react'
import { Badge } from '@shared/ui/badge'

export type MasterDetailItem = {
    badge?: string
    id: string
    subtitle?: string
    title: string
}

type MasterDetailProps = {
    children: ReactNode
    empty: ReactNode
    items: MasterDetailItem[]
    listLabel: string
    onSelect: (id: string) => void
    selectedId: string | undefined
}

export const MasterDetail: FC<MasterDetailProps> = ({ children, empty, items, listLabel, onSelect, selectedId }) => {
    if (items.length === 0) {
        return <>{empty}</>
    }

    return (
        <div className="grid gap-px bg-background lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="min-w-0 bg-card">
                <nav aria-label={listLabel} className="max-h-72 overflow-y-auto lg:max-h-none lg:border-r lg:border-background">
                    <ul className="grid gap-px bg-background">
                        {items.map((item) => {
                            const selected = item.id === selectedId
                            return (
                                <li key={item.id}>
                                    <button
                                        className={`grid w-full min-w-0 gap-1 p-3 text-left ${
                                            selected ? 'bg-foreground text-background' : 'bg-card hover:bg-muted'
                                        }`}
                                        onClick={() => onSelect(item.id)}
                                        type="button"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                                            {item.badge ? <Badge variant={selected ? undefined : 'muted'}>{item.badge}</Badge> : null}
                                        </span>
                                        {item.subtitle ? (
                                            <span className={`truncate text-xs ${selected ? 'text-background/70' : 'text-muted-foreground'}`}>
                                                {item.subtitle}
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </div>
            <div className="min-w-0 bg-card p-3">{children}</div>
        </div>
    )
}
