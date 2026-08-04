'use client'

import type { FC, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

type SummaryGridItem = {
    label: string
    value: ReactNode
}

type SummaryGridProps = {
    className?: string
    items: SummaryGridItem[]
}

export const SummaryGrid: FC<SummaryGridProps> = ({ className, items }) => (
    <dl className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
        {items.map((item) => (
            <div key={item.label} className="min-w-0">
                <dt className="text-xs text-text-subtle">{item.label}</dt>
                <dd className="mt-1 truncate text-sm tabular-nums text-text-strong">{item.value}</dd>
            </div>
        ))}
    </dl>
)
