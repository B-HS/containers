'use client'

import type { CSSProperties } from 'react'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => (
    <Sonner
        theme="system"
        className="toaster group"
        icons={{
            success: <CircleCheckIcon className="size-4 text-success" />,
            info: <InfoIcon className="size-4 text-text-muted" />,
            warning: <TriangleAlertIcon className="size-4 text-warning" />,
            error: <OctagonXIcon className="size-4 text-danger" />,
            loading: <Loader2Icon className="size-4 animate-spin text-text-muted" />,
        }}
        toastOptions={{
            classNames: {
                toast: 'group flex w-full items-center gap-3 bg-popover p-4 text-sm text-popover-foreground shadow-lg',
                title: 'font-medium text-text-strong',
                description: 'text-text-muted',
                actionButton: 'inline-flex h-7 items-center px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-85',
                cancelButton: 'inline-flex h-7 items-center px-3 text-xs font-medium bg-overlay-subtle text-text-strong hover:bg-overlay-hover',
                closeButton: 'bg-overlay-subtle text-text-muted hover:bg-overlay-hover',
            },
        }}
        style={
            {
                '--normal-bg': 'var(--popover)',
                '--normal-text': 'var(--popover-foreground)',
                '--normal-border': 'transparent',
                '--border-radius': 'var(--radius)',
            } as CSSProperties
        }
        {...props}
    />
)

export { Toaster }
