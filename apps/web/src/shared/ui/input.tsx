import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Input: FC<ComponentProps<'input'>> = ({ className, ...props }) => (
    <input
        data-slot="input"
        className={cn(
            'h-10 w-full border border-muted bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground',
            className,
        )}
        {...props}
    />
)
