import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Textarea: FC<ComponentProps<'textarea'>> = ({ className, ...props }) => (
    <textarea
        data-slot="textarea"
        className={cn(
            'bg-input field-sizing-content flex min-h-16 w-full px-3 py-2 text-base transition-[color,box-shadow] outline-none',
            'placeholder:text-text-subtle md:text-sm',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/40 aria-invalid:ring-[3px]',
            className,
        )}
        {...props}
    />
)
