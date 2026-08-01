import type { ComponentProps, FC } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/utils'

const badgeVariants = cva('inline-flex w-fit items-center px-2 py-1 text-xs font-medium whitespace-nowrap', {
    variants: {
        variant: {
            default: 'bg-foreground text-background',
            muted: 'bg-muted text-muted-foreground',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
})

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export const Badge: FC<BadgeProps> = ({ className, variant, ...props }) => (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
)
