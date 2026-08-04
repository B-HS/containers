import type { ComponentProps, FC } from 'react'

import { cn } from '@shared/lib/utils'

const Skeleton: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="skeleton" className={cn('animate-pulse bg-overlay-hover', className)} {...props} />
)

export { Skeleton }
