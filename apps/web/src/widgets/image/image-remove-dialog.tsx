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
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type ImageRemoveDialogProps = {
    imageId: string
    imageName: string
    isRemoving: boolean
    onConfirm: (input: { confirmation: string; force: boolean }) => void
    usedByNames: string[]
}

export const ImageRemoveDialog: FC<ImageRemoveDialogProps> = ({ imageId, imageName, isRemoving, onConfirm, usedByNames }) => {
    const [confirmation, setConfirmation] = useState('')
    const [force, setForce] = useState(false)
    const [open, setOpen] = useState(false)
    const t = useTranslations('Dashboard')
    const isMatched = confirmation === imageName

    const changeOpen = (nextOpen: boolean) => {
        setOpen(nextOpen)
        setConfirmation('')
        setForce(false)
    }

    return (
        <AlertDialog open={open} onOpenChange={changeOpen}>
            <AlertDialogTrigger asChild>
                <Button type="button" size="xs" variant="ghost">
                    <Trash2 aria-hidden="true" />
                    {t('remove')}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('imageRemoveTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('imageRemoveDescription', { name: imageName })}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-3">
                    {usedByNames.length > 0 ? (
                        <Alert variant="warning">
                            <AlertTitle>{t('imageInUse', { count: usedByNames.length, names: usedByNames.join(', ') })}</AlertTitle>
                        </Alert>
                    ) : (
                        <Alert>
                            <AlertDescription>{t('imageNotInUse')}</AlertDescription>
                        </Alert>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor={`image-remove-confirmation-${imageId}`}>{t('imageRemoveInputLabel')}</Label>
                        <Input
                            id={`image-remove-confirmation-${imageId}`}
                            autoComplete="off"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-1 bg-overlay-subtle p-3">
                        <Label htmlFor={`image-remove-force-${imageId}`}>
                            <Checkbox
                                id={`image-remove-force-${imageId}`}
                                checked={force}
                                onCheckedChange={(checked) => setForce(checked === true)}
                            />
                            {t('force')}
                        </Label>
                        <p className="pl-6 text-xs text-text-subtle">{t('imageForceHelp')}</p>
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
