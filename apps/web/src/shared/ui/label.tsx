import type { ComponentProps, FC } from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@shared/lib/utils'

export const Label: FC<ComponentProps<typeof LabelPrimitive.Root>> = ({ className, ...props }) => (
    <LabelPrimitive.Root
        data-slot="label"
        className={cn(
            'flex items-center gap-2 text-sm leading-none font-medium select-none',
            'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            className,
        )}
        {...props}
    />
)
