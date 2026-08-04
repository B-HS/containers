import type { ComponentProps, FC } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@shared/lib/utils'

export const badgeVariants = cva(
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/40 aria-invalid:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
                secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-overlay-active',
                destructive: 'bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90',
                outline: 'bg-overlay-subtle text-foreground [a&]:hover:bg-overlay-hover',
                neutral: 'bg-overlay-subtle text-text-muted [a&]:hover:bg-overlay-hover',
                muted: 'bg-overlay-subtle text-text-muted [a&]:hover:bg-overlay-hover',
                attention: 'bg-warning-surface text-warning',
                danger: 'bg-danger-surface text-danger',
                success: 'bg-success-surface text-success',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
)

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }

export const Badge: FC<BadgeProps> = ({ className, variant = 'default', asChild = false, ...props }) => {
    const Comp = asChild ? Slot.Root : 'span'

    return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}
