import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'ghost'

type ButtonProps = ComponentProps<'button'> & {
    variant?: ButtonVariant
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    default: 'bg-primary text-primary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-border bg-transparent hover:bg-muted',
    ghost: 'bg-transparent hover:bg-muted',
}

export const Button: FC<ButtonProps> = ({ className, variant = 'outline', ...props }) => (
    <button
        data-slot="button"
        className={cn(
            'inline-flex h-9 items-center justify-center whitespace-nowrap px-4 text-sm font-medium transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-50',
            VARIANT_CLASSES[variant],
            className,
        )}
        {...props}
    />
)
