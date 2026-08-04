'use client'

import type { FC } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@shared/ui/alert-dialog'
import { Spinner } from '@shared/ui/spinner'

type JobCancelDialogProps = {
    actionLabel: string
    cancelLabel: string
    description: string
    jobId: string
    jobKind: string
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
    open: boolean
    pending: boolean
    title: string
}

export const JobCancelDialog: FC<JobCancelDialogProps> = ({
    actionLabel,
    cancelLabel,
    description,
    jobId,
    jobKind,
    onConfirm,
    onOpenChange,
    open,
    pending,
    title,
}) => (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-1 bg-surface-3 p-4">
                <p className="truncate text-sm font-medium text-text-strong">{jobKind}</p>
                <p className="truncate font-mono text-xs tabular-nums text-text-subtle">{jobId}</p>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
                <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:opacity-85"
                    disabled={pending}
                    onClick={(event) => {
                        event.preventDefault()
                        onConfirm()
                    }}
                >
                    {pending ? <Spinner /> : null}
                    {actionLabel}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
)
