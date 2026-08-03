import type { FC } from 'react'

type PageHeaderProps = {
    description: string
    title: string
}

export const PageHeader: FC<PageHeaderProps> = ({ description, title }) => (
    <header className="bg-card p-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </header>
)
