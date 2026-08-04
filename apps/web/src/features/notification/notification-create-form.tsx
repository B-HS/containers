'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { NOTIFICATION_SUBSCRIBABLE_EVENT_TYPES } from '@containers/contracts/notification'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Switch } from '@shared/ui/switch'

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
        eventLabels: Record<string, string>
        events: string
        name: string
        save: string
        webhookUrl: string
    }
    onSave: (input: NotificationCreateInput) => Promise<boolean>
}

export const NotificationCreateForm: FC<NotificationCreateFormProps> = ({ busy, labels, onSave }) => {
    const [enabled, setEnabled] = useState(true)
    const [subscribedEvents, setSubscribedEvents] = useState<string[]>([...NOTIFICATION_SUBSCRIBABLE_EVENT_TYPES])

    const toggleEvent = (eventType: string, checked: boolean) => {
        setSubscribedEvents((current) => (checked ? [...new Set([...current, eventType])] : current.filter((subscribed) => subscribed !== eventType)))
    }

    return (
        <form
            className="grid gap-5 bg-surface-3 p-5"
            onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const data = new FormData(form)
                void onSave({
                    enabled,
                    eventTypes: NOTIFICATION_SUBSCRIBABLE_EVENT_TYPES.filter((eventType) => subscribedEvents.includes(eventType)),
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
            <div className="grid gap-3">
                <p className="text-xs text-text-subtle">{labels.events}</p>
                <div className="flex flex-wrap items-center gap-6">
                    {NOTIFICATION_SUBSCRIBABLE_EVENT_TYPES.map((eventType) => (
                        <Label key={eventType} htmlFor={`notification-event-${eventType}`} className="text-text-muted">
                            <Switch
                                id={`notification-event-${eventType}`}
                                checked={subscribedEvents.includes(eventType)}
                                onCheckedChange={(checked) => toggleEvent(eventType, checked)}
                            />
                            {labels.eventLabels[eventType] ?? eventType}
                        </Label>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <Label htmlFor="notification-enabled" className="text-text-muted">
                    <Switch id="notification-enabled" checked={enabled} onCheckedChange={setEnabled} />
                    {labels.enabled}
                </Label>
                <Button type="submit" size="sm" disabled={busy}>
                    {labels.save}
                </Button>
            </div>
        </form>
    )
}
