import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Button: FC<ComponentProps<'button'>> = ({ className, ...props }) => (
    <button
        data-slot="button"
        className={cn(
            'inline-flex h-9 items-center justify-center bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-50',
            className,
        )}
        {...props}
    />
)
