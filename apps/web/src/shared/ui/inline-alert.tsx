import type { FC, ReactNode } from 'react'
import { cn } from '@shared/lib/utils'

type InlineAlertProps = {
    children: ReactNode
    className?: string
    role?: 'alert' | 'status'
    tone?: 'error' | 'notice' | 'success' | 'warning'
}

const toneClass: Record<NonNullable<InlineAlertProps['tone']>, string> = {
    error: 'bg-danger-surface text-danger',
    notice: 'bg-background text-foreground',
    success: 'bg-success-surface text-success',
    warning: 'bg-warning-surface text-warning',
}

export const InlineAlert: FC<InlineAlertProps> = ({ children, className, role = 'status', tone = 'notice' }) => (
    <p className={cn('mx-3 mb-3 p-3 text-sm', toneClass[tone], className)} role={role}>
        {children}
    </p>
)
