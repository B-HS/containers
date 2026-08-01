import type { ComponentProps, FC } from 'react'
import { cn } from '@shared/lib/utils'

export const Label: FC<ComponentProps<'label'>> = ({ className, ...props }) => (
    <label data-slot="label" className={cn('text-sm font-medium', className)} {...props} />
)
