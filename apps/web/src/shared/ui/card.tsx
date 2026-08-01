import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Card: FC<ComponentProps<'article'>> = ({ className, ...props }) => (
    <article data-slot="card" className={cn('bg-card text-card-foreground flex flex-col gap-6 border-0 py-6 shadow-none', className)} {...props} />
)
