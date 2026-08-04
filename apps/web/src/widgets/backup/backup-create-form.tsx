'use client'

import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useCreateBackup } from '@entities/backup/backup.query'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Spinner } from '@shared/ui/spinner'

const BACKUP_LABEL_MAX_LENGTH = 100

export const BackupCreateForm: FC = () => {
    const [label, setLabel] = useState('')
    const translations = useTranslations('Dashboard')
    const createBackup = useCreateBackup()

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        createBackup.mutate(label.trim() === '' ? null : label.trim(), {
            onError: (createError) => toast.error(createError instanceof Error ? createError.message : translations('backupFailed')),
            onSuccess: () => {
                setLabel('')
                toast.success(translations('backupCreated'))
            },
        })
    }

    return (
        <form className="grid gap-3 bg-surface-3 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submit}>
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="backup-label">{translations('backupLabel')}</Label>
                <Input
                    id="backup-label"
                    maxLength={BACKUP_LABEL_MAX_LENGTH}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    disabled={createBackup.isPending}
                />
            </div>
            <Button type="submit" disabled={createBackup.isPending}>
                {createBackup.isPending ? <Spinner /> : null}
                {translations('backupCreate')}
            </Button>
        </form>
    )
}
