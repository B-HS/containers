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
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type ContainerRemoveDialogProps = {
    containerId: string
    containerName: string
    isRemoving: boolean
    onConfirm: (input: { confirmation: string; force: boolean }) => void
}

export const ContainerRemoveDialog: FC<ContainerRemoveDialogProps> = ({ containerId, containerName, isRemoving, onConfirm }) => {
    const [confirmation, setConfirmation] = useState('')
    const [force, setForce] = useState(false)
    const [open, setOpen] = useState(false)
    const t = useTranslations('Dashboard')
    const isMatched = confirmation === containerName

    const changeOpen = (nextOpen: boolean) => {
        setOpen(nextOpen)
        setConfirmation('')
        setForce(false)
    }

    return (
        <AlertDialog open={open} onOpenChange={changeOpen}>
            <AlertDialogTrigger asChild>
                <Button type="button" size="sm" variant="destructive">
                    <Trash2 aria-hidden="true" />
                    {t('remove')}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('containerRemoveTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('containerRemoveDescription', { name: containerName })}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-3">
                    <div className="grid gap-2">
                        <Label htmlFor={`container-remove-confirmation-${containerId}`}>{t('containerRemoveInputLabel')}</Label>
                        <Input
                            id={`container-remove-confirmation-${containerId}`}
                            autoComplete="off"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-1 bg-overlay-subtle p-3">
                        <Label htmlFor={`container-remove-force-${containerId}`}>
                            <Checkbox
                                id={`container-remove-force-${containerId}`}
                                checked={force}
                                onCheckedChange={(checked) => setForce(checked === true)}
                            />
                            {t('force')}
                        </Label>
                        <p className="pl-6 text-xs text-text-subtle">{t('containerForceHelp')}</p>
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground"
                        disabled={!isMatched || isRemoving}
                        onClick={() => onConfirm({ confirmation, force })}
                    >
                        {t('remove')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
