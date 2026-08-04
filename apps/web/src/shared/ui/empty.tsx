import type { ComponentProps, FC } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@shared/lib/utils'

const Empty: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div
        data-slot="empty"
        className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center text-balance md:py-20', className)}
        {...props}
    />
)

const EmptyHeader: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="empty-header" className={cn('flex max-w-sm flex-col items-center gap-2 text-center', className)} {...props} />
)

const emptyMediaVariants = cva('mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0', {
    variants: {
        variant: {
            default: 'bg-transparent text-text-subtle',
            icon: "flex size-10 shrink-0 items-center justify-center bg-overlay-subtle text-text-muted [&_svg:not([class*='size-'])]:size-6",
        },
    },
    defaultVariants: {
        variant: 'default',
    },
})

const EmptyMedia: FC<ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>> = ({ className, variant = 'default', ...props }) => (
    <div data-slot="empty-media" data-variant={variant} className={cn(emptyMediaVariants({ variant, className }))} {...props} />
)

const EmptyTitle: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="empty-title" className={cn('text-lg font-medium tracking-tight text-text-strong', className)} {...props} />
)

const EmptyDescription: FC<ComponentProps<'p'>> = ({ className, ...props }) => (
    <p
        data-slot="empty-description"
        className={cn('text-sm/relaxed text-text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground', className)}
        {...props}
    />
)

const EmptyContent: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div
        data-slot="empty-content"
        className={cn('flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance', className)}
        {...props}
    />
)

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia, emptyMediaVariants }
