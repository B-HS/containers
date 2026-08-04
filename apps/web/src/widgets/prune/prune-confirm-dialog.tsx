'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
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
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

const PRUNE_CONFIRMATION = 'DELETE UNUSED RESOURCES'

type PruneConfirmDialogProps = {
    candidateCount: number
    isExecuting: boolean
    onConfirm: (confirmation: string) => void
    protectedCount: number
    reclaimableLabel: string
}

export const PruneConfirmDialog: FC<PruneConfirmDialogProps> = ({ candidateCount, isExecuting, onConfirm, protectedCount, reclaimableLabel }) => {
    const [confirmation, setConfirmation] = useState('')
    const [open, setOpen] = useState(false)
    const t = useTranslations('Dashboard')

    const changeOpen = (nextOpen: boolean) => {
        setOpen(nextOpen)
        setConfirmation('')
    }

    return (
        <AlertDialog open={open} onOpenChange={changeOpen}>
            <AlertDialogTrigger asChild>
                <Button type="button" size="sm" variant="destructive">
                    <Trash2 aria-hidden="true" />
                    {t('pruneExecute')}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('pruneConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('pruneConfirmDescription', { count: candidateCount, protectedCount, size: reclaimableLabel })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="prune-confirmation">{t('pruneConfirmInputLabel')}</Label>
                    <Input
                        id="prune-confirmation"
                        autoComplete="off"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground"
                        disabled={confirmation !== PRUNE_CONFIRMATION || isExecuting}
                        onClick={() => onConfirm(confirmation)}
                    >
                        {t('pruneExecute')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
