'use client'

import type { FC } from 'react'
import { useState } from 'react'
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
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Spinner } from '@shared/ui/spinner'

type BackupConfirmDialogProps = {
    actionLabel: string
    cancelLabel: string
    confirmationLabel: string
    description: string
    expectedConfirmation: string
    inputId: string
    onConfirm: (confirmation: string) => void
    onOpenChange: (open: boolean) => void
    open: boolean
    pending: boolean
    targetLabel: string
    title: string
}

export const BackupConfirmDialog: FC<BackupConfirmDialogProps> = ({
    actionLabel,
    cancelLabel,
    confirmationLabel,
    description,
    expectedConfirmation,
    inputId,
    onConfirm,
    onOpenChange,
    open,
    pending,
    targetLabel,
    title,
}) => {
    const [confirmation, setConfirmation] = useState('')
    const matches = confirmation.trim() === expectedConfirmation

    const changeOpen = (nextOpen: boolean) => {
        setConfirmation('')
        onOpenChange(nextOpen)
    }

    return (
        <AlertDialog open={open} onOpenChange={changeOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2 bg-surface-3 p-4">
                    <p className="truncate text-sm font-medium text-text-strong">{targetLabel}</p>
                    <p className="truncate font-mono text-xs tabular-nums text-text-subtle">{expectedConfirmation}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor={inputId}>{confirmationLabel}</Label>
                    <Input
                        id={inputId}
                        autoComplete="off"
                        spellCheck={false}
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:opacity-85"
                        disabled={!matches || pending}
                        onClick={(event) => {
                            event.preventDefault()
                            onConfirm(confirmation.trim())
                        }}
                    >
                        {pending ? <Spinner /> : null}
                        {actionLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
