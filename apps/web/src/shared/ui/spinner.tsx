import type { ComponentProps, FC } from 'react'
import { Loader2Icon } from 'lucide-react'

import { cn } from '@shared/lib/utils'

const Spinner: FC<ComponentProps<typeof Loader2Icon>> = ({ className, ...props }) => (
    <Loader2Icon role="status" aria-label="Loading" className={cn('size-4 animate-spin', className)} {...props} />
)

export { Spinner }
