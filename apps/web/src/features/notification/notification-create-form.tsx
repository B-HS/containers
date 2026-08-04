'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Switch } from '@shared/ui/switch'

const BACKUP_FAILED_EVENT = 'backup.failed'

type NotificationCreateInput = {
    enabled: boolean
    eventTypes: string[]
    name: string
    webhookUrl: string
}

type NotificationCreateFormProps = {
    busy: boolean
    labels: {
        destinationCreate: string
        enabled: string
        eventBackupFailed: string
        name: string
        save: string
        webhookUrl: string
    }
    onSave: (input: NotificationCreateInput) => Promise<boolean>
}

export const NotificationCreateForm: FC<NotificationCreateFormProps> = ({ busy, labels, onSave }) => {
    const [enabled, setEnabled] = useState(true)
    const [eventBackupFailed, setEventBackupFailed] = useState(true)

    return (
        <form
            className="grid gap-5 bg-surface-3 p-5"
            onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const data = new FormData(form)
                void onSave({
                    enabled,
                    eventTypes: eventBackupFailed ? [BACKUP_FAILED_EVENT] : [],
                    name: String(data.get('name') ?? ''),
                    webhookUrl: String(data.get('webhookUrl') ?? ''),
                }).then((saved) => {
                    if (saved) form.reset()
                })
            }}
        >
            <p className="text-sm font-medium text-text-strong">{labels.destinationCreate}</p>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="notification-name">{labels.name}</Label>
                    <Input id="notification-name" name="name" placeholder="ops-discord" required />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="notification-webhook-url">{labels.webhookUrl}</Label>
                    <Input id="notification-webhook-url" name="webhookUrl" type="url" placeholder="https://discord.com/api/webhooks/..." required />
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                    <Label htmlFor="notification-event-backup-failed" className="text-text-muted">
                        <Switch id="notification-event-backup-failed" checked={eventBackupFailed} onCheckedChange={setEventBackupFailed} />
                        {labels.eventBackupFailed}
                    </Label>
                    <Label htmlFor="notification-enabled" className="text-text-muted">
                        <Switch id="notification-enabled" checked={enabled} onCheckedChange={setEnabled} />
                        {labels.enabled}
                    </Label>
                </div>
                <Button type="submit" size="sm" disabled={busy}>
                    {labels.save}
                </Button>
            </div>
        </form>
    )
}
