'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { cn } from '@shared/lib/utils'

const ACTION_BASE_CLASSES =
    'inline-flex h-9 items-center justify-center gap-2 px-4 text-sm font-medium whitespace-nowrap transition-[opacity,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'

const AlertDialog = ({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) => (
    <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
)

const AlertDialogTrigger = ({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) => (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
)

const AlertDialogPortal = ({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) => (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
)

const AlertDialogOverlay = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) => (
    <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className={cn(
            'fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
            className,
        )}
        {...props}
    />
)

const AlertDialogContent = ({
    className,
    size = 'default',
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
    size?: 'default' | 'sm'
}) => (
    <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogPrimitive.Content
            data-slot="alert-dialog-content"
            data-size={size}
            className={cn(
                'group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 bg-popover p-6 text-popover-foreground shadow-lg duration-200 outline-none data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg',
                className,
            )}
            {...props}
        />
    </AlertDialogPortal>
)

const AlertDialogHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
    <div
        data-slot="alert-dialog-header"
        className={cn(
            'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
            className,
        )}
        {...props}
    />
)

const AlertDialogFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
    <div
        data-slot="alert-dialog-footer"
        className={cn(
            'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
            className,
        )}
        {...props}
    />
)

const AlertDialogTitle = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) => (
    <AlertDialogPrimitive.Title
        data-slot="alert-dialog-title"
        className={cn(
            'text-lg font-semibold text-text-strong sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
            className,
        )}
        {...props}
    />
)

const AlertDialogDescription = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) => (
    <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={cn('text-sm text-text-muted', className)} {...props} />
)

const AlertDialogMedia = ({ className, ...props }: React.ComponentProps<'div'>) => (
    <div
        data-slot="alert-dialog-media"
        className={cn(
            "mb-2 inline-flex size-16 items-center justify-center bg-overlay-subtle text-text-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
            className,
        )}
        {...props}
    />
)

const AlertDialogAction = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Action>) => (
    <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(ACTION_BASE_CLASSES, 'bg-primary text-primary-foreground hover:opacity-85', className)}
        {...props}
    />
)

const AlertDialogCancel = ({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) => (
    <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(ACTION_BASE_CLASSES, 'bg-overlay-subtle text-text-strong hover:bg-overlay-hover', className)}
        {...props}
    />
)

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
}
