import type { ComponentProps, FC } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/utils'

export const alertVariants = cva(
    'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
    {
        variants: {
            variant: {
                default: 'bg-overlay-subtle text-foreground',
                destructive: 'bg-danger-surface text-danger *:data-[slot=alert-description]:text-danger/90',
                warning: 'bg-warning-surface text-warning *:data-[slot=alert-description]:text-warning/90',
                success: 'bg-success-surface text-success *:data-[slot=alert-description]:text-success/90',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
)

type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>

export const Alert: FC<AlertProps> = ({ className, variant, ...props }) => (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
)

export const AlertTitle: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="alert-title" className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)} {...props} />
)

export const AlertDescription: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div
        data-slot="alert-description"
        className={cn('text-text-muted col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed', className)}
        {...props}
    />
)
