import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Textarea: FC<ComponentProps<'textarea'>> = ({ className, ...props }) => (
    <textarea
        data-slot="textarea"
        className={cn(
            'min-h-24 w-full resize-y border border-muted bg-background px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground',
            className,
        )}
        {...props}
    />
)
