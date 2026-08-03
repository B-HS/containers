import type { FC, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

type InlineAlertProps = {
    children: ReactNode
    className?: string
    role?: 'alert' | 'status'
    tone?: 'error' | 'notice' | 'success' | 'warning'
}

const toneClass: Record<NonNullable<InlineAlertProps['tone']>, string> = {
    error: 'bg-red-950 text-red-100',
    notice: 'bg-background text-foreground',
    success: 'bg-green-950 text-green-100',
    warning: 'bg-amber-950 text-amber-100',
}

export const InlineAlert: FC<InlineAlertProps> = ({ children, className, role = 'status', tone = 'notice' }) => (
    <p className={cn('mx-3 mb-3 p-3 text-sm', toneClass[tone], className)} role={role}>
        {children}
    </p>
)
