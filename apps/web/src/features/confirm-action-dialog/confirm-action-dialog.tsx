'use client'

import type { FC, ReactNode } from 'react'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
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

type ConfirmActionDialogProps = {
    confirmLabel: string
    confirmationHint?: string
    confirmationValue?: string
    description: string
    impact?: string
    onConfirm: () => void
    pending?: boolean
    target?: string
    title: string
    trigger: ReactNode
}

export const ConfirmActionDialog: FC<ConfirmActionDialogProps> = ({
    confirmLabel,
    confirmationHint,
    confirmationValue,
    description,
    impact,
    onConfirm,
    pending = false,
    target,
    title,
    trigger,
}) => {
    const inputId = useId()
    const [confirmation, setConfirmation] = useState('')
    const t = useTranslations('Dashboard')
    const matched = confirmationValue === undefined || confirmation === confirmationValue

    const changeOpen = (next: boolean) => {
        if (!next) {
            setConfirmation('')
        }
    }

    return (
        <AlertDialog onOpenChange={changeOpen}>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {target ? <p className="bg-surface-3 px-3 py-2 font-mono text-xs break-all text-text-strong">{target}</p> : null}
                {impact ? <p className="text-sm text-text-muted">{impact}</p> : null}
                {confirmationValue === undefined ? null : (
                    <div className="grid gap-2">
                        <Label htmlFor={inputId}>{confirmationHint}</Label>
                        <Input
                            id={inputId}
                            autoComplete="off"
                            spellCheck={false}
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                        />
                    </div>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:opacity-85"
                        disabled={!matched || pending}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
