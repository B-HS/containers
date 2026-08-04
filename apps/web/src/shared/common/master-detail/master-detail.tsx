'use client'

import type { FC, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'

export type MasterDetailItem = {
    badge?: string
    id: string
    indent?: boolean
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
            <div className="min-w-0 bg-surface-1">
                <nav aria-label={listLabel} className="max-h-72 overflow-y-auto lg:max-h-none">
                    <ul className="grid gap-px bg-background">
                        {items.map((item) => {
                            const selected = item.id === selectedId
                            return (
                                <li key={item.id}>
                                    <button
                                        aria-current={selected ? 'true' : undefined}
                                        className={cn(
                                            'grid w-full min-w-0 gap-0.5 bg-surface-1 px-3 py-2 text-left outline-none transition-colors',
                                            'hover:bg-overlay-hover focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                            item.indent && 'pl-7',
                                            selected && 'bg-overlay-active',
                                        )}
                                        onClick={() => onSelect(item.id)}
                                        type="button"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className={cn('min-w-0 truncate text-sm text-text-strong', selected && 'font-medium')}>
                                                {item.title}
                                            </span>
                                            {item.badge ? <Badge variant="neutral">{item.badge}</Badge> : null}
                                        </span>
                                        {item.subtitle ? <span className="truncate text-xs text-text-subtle">{item.subtitle}</span> : null}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </div>
            <div className="min-w-0 bg-surface-1 p-4">{children}</div>
        </div>
    )
}
