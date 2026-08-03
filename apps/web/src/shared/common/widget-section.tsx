import type { FC, ReactNode } from 'react'
import { Badge } from '@shared/ui/badge'

type WidgetSectionProps = {
    badge?: ReactNode
    children: ReactNode
    header?: ReactNode
    id: string
    notice?: string | undefined
    title: string
}

export const WidgetSection: FC<WidgetSectionProps> = ({ badge, children, header, id, notice, title }) => (
    <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby={id}>
        <header className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
                <h2 id={id} className="text-sm font-semibold">
                    {title}
                </h2>
                {notice ? <p className="mt-1 text-xs text-muted-foreground">{notice}</p> : null}
            </div>
            {header ?? (badge === undefined ? null : <Badge variant="muted">{badge}</Badge>)}
        </header>
        {children}
    </section>
)
