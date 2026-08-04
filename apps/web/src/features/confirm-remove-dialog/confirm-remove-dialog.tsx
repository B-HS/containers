'use client'

import type { FC, ReactNode } from 'react'
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
    AlertDialogTrigger,
} from '@shared/ui/alert-dialog'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type ConfirmRemoveDialogProps = {
    cancelLabel: string
    children?: ReactNode
    confirmationLabel: string
    description: string
    disabled: boolean
    expectedValue: string
    inputId: string
    onConfirm: () => void
    removeLabel: string
    target: string
    title: string
    trigger: ReactNode
}

export const ConfirmRemoveDialog: FC<ConfirmRemoveDialogProps> = ({
    cancelLabel,
    children,
    confirmationLabel,
    description,
    disabled,
    expectedValue,
    inputId,
    onConfirm,
    removeLabel,
    target,
    title,
    trigger,
}) => {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')

    const changeOpen = (nextOpen: boolean) => {
        setValue('')
        setOpen(nextOpen)
    }

    return (
        <AlertDialog open={open} onOpenChange={changeOpen}>
            <AlertDialogTrigger asChild disabled={disabled}>
                {trigger}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-4 bg-surface-3 p-4">
                    <p className="truncate font-mono text-sm text-text-strong">{target}</p>
                    {children}
                    <div className="grid gap-2">
                        <Label htmlFor={inputId}>{confirmationLabel}</Label>
                        <Input id={inputId} autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:opacity-85"
                        disabled={value !== expectedValue}
                        onClick={onConfirm}
                    >
                        {removeLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
