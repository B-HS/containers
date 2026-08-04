import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Input: FC<ComponentProps<'input'>> = ({ className, type, ...props }) => (
    <input
        type={type}
        data-slot="input"
        className={cn(
            'bg-input h-9 w-full min-w-0 px-3 py-1 text-base transition-[color,box-shadow] outline-none',
            'selection:bg-primary selection:text-primary-foreground placeholder:text-text-subtle md:text-sm',
            'file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/40 aria-invalid:ring-[3px]',
            className,
        )}
        {...props}
    />
)
