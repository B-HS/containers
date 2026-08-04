'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NotificationDestination } from '@containers/contracts/notification'
import {
    useRemoveNotificationDestination,
    useSaveNotificationDestination,
    useTestNotificationDestination,
    useToggleNotificationDestination,
} from '@entities/notification/notification.query'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

type NotificationWidgetProps = {
    destinations: NotificationDestination[]
    labels: {
        confirmation: string
        disabled: string
        empty: string
        enabled: string
        eventBackupFailed: string
        failed: string
        lastDelivery: string
        name: string
        none: string
        remove: string
        save: string
        test: string
        testStarted: string
        title: string
        version: string
        webhookUrl: string
    }
}

export const NotificationWidget: FC<NotificationWidgetProps> = ({ destinations: initialDestinations, labels }) => {
    const [busy, setBusy] = useState<string>()
    const [destinations, setDestinations] = useState(initialDestinations)
    const [enabled, setEnabled] = useState(true)
    const [error, setError] = useState<string>()
    const [eventBackupFailed, setEventBackupFailed] = useState(true)
    const [notice, setNotice] = useState<string>()
    const { onSelect, selectedId, selectedItem: selectedDestination } = useMasterDetailSelection(destinations)
    const saveDestination = useSaveNotificationDestination()
    const testDestination = useTestNotificationDestination()
    const toggleDestination = useToggleNotificationDestination()
    const removeDestination = useRemoveNotificationDestination()

    const save = async (form: HTMLFormElement) => {
        setBusy('save')
        setError(undefined)
        setNotice(undefined)
        const formData = new FormData(form)
        try {
            const saved = await saveDestination.mutateAsync({
                enabled,
                eventTypes: eventBackupFailed ? ['backup.failed'] : [],
                name: String(formData.get('name')),
                webhookUrl: String(formData.get('webhookUrl')),
            })
            setDestinations((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
            form.reset()
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const test = async (destination: NotificationDestination) => {
        setBusy(destination.id)
        setError(undefined)
        setNotice(undefined)
        try {
            await testDestination.mutateAsync(destination.id)
            setNotice(labels.testStarted)
        } catch (testError) {
            setError(testError instanceof Error ? testError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const toggle = async (destination: NotificationDestination) => {
        setBusy(destination.id)
        setError(undefined)
        setNotice(undefined)
        try {
            const updated = await toggleDestination.mutateAsync({ id: destination.id, enabled: !destination.enabled })
            setDestinations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        } catch (toggleError) {
            setError(toggleError instanceof Error ? toggleError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (destination: NotificationDestination, confirmation: string) => {
        setBusy(destination.id)
        setError(undefined)
        setNotice(undefined)
        try {
            await removeDestination.mutateAsync({ id: destination.id, confirmation })
            setDestinations((current) => current.filter((item) => item.id !== destination.id))
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="notification-control-title" title={labels.title} badge={destinations.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {notice ? <InlineAlert tone="success">{notice}</InlineAlert> : null}
            <form
                className="grid gap-3 border-t border-background p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                onSubmit={(event) => {
                    event.preventDefault()
                    void save(event.currentTarget)
                }}
            >
                <div className="grid gap-1">
                    <Label htmlFor="notification-name">{labels.name}</Label>
                    <Input id="notification-name" name="name" placeholder="ops-discord" required />
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="notification-webhook-url">{labels.webhookUrl}</Label>
                    <Input id="notification-webhook-url" name="webhookUrl" type="url" placeholder="https://discord.com/api/webhooks/..." required />
                </div>
                <div className="flex items-center gap-3 pb-1 text-sm">
                    <div className="flex items-center gap-1">
                        <Checkbox
                            id="notification-event-backup-failed"
                            checked={eventBackupFailed}
                            onCheckedChange={(checked) => setEventBackupFailed(checked === true)}
                        />
                        <Label htmlFor="notification-event-backup-failed">{labels.eventBackupFailed}</Label>
                    </div>
                    <div className="flex items-center gap-1">
                        <Checkbox id="notification-enabled" checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
                        <Label htmlFor="notification-enabled">{labels.enabled}</Label>
                    </div>
                    <Button type="submit" variant="default" disabled={busy === 'save'}>
                        {labels.save}
                    </Button>
                </div>
            </form>
            {destinations.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            {selectedDestination ? (
                <MasterDetail
                    empty={labels.empty}
                    items={destinations.map((destination) => ({
                        badge: destination.enabled ? labels.enabled : labels.disabled,
                        id: destination.id,
                        subtitle: `${destination.type} · ${destination.version}`,
                        title: destination.name,
                    }))}
                    listLabel={labels.title}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-3 p-3">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-semibold">{selectedDestination.name}</p>
                                    <Badge variant={selectedDestination.enabled ? undefined : 'muted'}>
                                        {selectedDestination.enabled ? labels.enabled : labels.disabled}
                                    </Badge>
                                    <Badge variant="muted">{selectedDestination.type}</Badge>
                                    {selectedDestination.eventTypes.map((eventType) => (
                                        <Badge key={eventType} variant="muted">
                                            {eventType === 'backup.failed' ? labels.eventBackupFailed : eventType}
                                        </Badge>
                                    ))}
                                    <Badge variant="muted">
                                        {labels.version} {selectedDestination.version}
                                    </Badge>
                                </div>
                                <dl className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                    <div className="min-w-0">
                                        <dt>{labels.lastDelivery}</dt>
                                        <dd className="mt-1 truncate text-foreground">
                                            {selectedDestination.lastDelivery.status === null
                                                ? labels.none
                                                : `${selectedDestination.lastDelivery.status}${selectedDestination.lastDelivery.failureCode === null ? '' : ` (${selectedDestination.lastDelivery.failureCode})`}${selectedDestination.lastDelivery.at === null ? '' : ` · ${formatDateTime(selectedDestination.lastDelivery.at) ?? labels.none}`}`}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button type="button" disabled={busy === selectedDestination.id} onClick={() => void test(selectedDestination)}>
                                    {labels.test}
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-muted text-muted-foreground"
                                    disabled={busy === selectedDestination.id}
                                    onClick={() => void toggle(selectedDestination)}
                                >
                                    {selectedDestination.enabled ? labels.disabled : labels.enabled}
                                </Button>
                            </div>
                        </div>
                        <form
                            className="grid gap-1"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void remove(selectedDestination, String(new FormData(event.currentTarget).get('confirmation') ?? ''))
                            }}
                        >
                            <Label htmlFor={`notification-confirm-${selectedDestination.id}`}>{labels.confirmation}</Label>
                            <div className="flex min-w-0 gap-px">
                                <Input id={`notification-confirm-${selectedDestination.id}`} name="confirmation" className="min-w-0" />
                                <Button type="submit" disabled={busy === selectedDestination.id}>
                                    {labels.remove}
                                </Button>
                            </div>
                        </form>
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
