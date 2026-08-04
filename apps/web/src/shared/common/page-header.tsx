import type { FC, ReactNode } from 'react'

type PageHeaderProps = {
    actions?: ReactNode
    description: string
    title: string
}

export const PageHeader: FC<PageHeaderProps> = ({ actions, description, title }) => (
    <header className="flex flex-wrap items-start justify-between gap-4 bg-surface-2 px-6 py-7">
        <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-text-strong">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
)
