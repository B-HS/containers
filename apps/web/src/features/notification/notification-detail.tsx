'use client'

import type { FC } from 'react'
import type { NotificationDestination } from '@containers/contracts/notification'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Label } from '@shared/ui/label'
import { Switch } from '@shared/ui/switch'

type NotificationDetailProps = {
    busy: boolean
    destination: NotificationDestination
    labels: {
        cancel: string
        confirmation: string
        confirmationMismatch: string
        confirmRemoveTitle: string
        disabled: string
        enabled: string
        eventLabels: Record<string, string>
        lastDelivery: string
        none: string
        remove: string
        removeImpact: string
        test: string
        version: string
    }
    onRemove: (confirmation: string) => void
    onTest: () => void
    onToggle: (enabled: boolean) => void
}

export const NotificationDetail: FC<NotificationDetailProps> = ({ busy, destination, labels, onRemove, onTest, onToggle }) => {
    const deliveryStatus = destination.lastDelivery.status
    const deliveryFailure = destination.lastDelivery.failureCode
    const deliveryAt = destination.lastDelivery.at

    return (
        <div className="grid min-w-0 gap-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-text-strong">{destination.name}</h3>
                        <Badge variant={destination.enabled ? 'success' : 'neutral'}>{destination.enabled ? labels.enabled : labels.disabled}</Badge>
                        <Badge variant="neutral">{destination.type}</Badge>
                        {destination.eventTypes.map((eventType) => (
                            <Badge key={eventType} variant="neutral">
                                {labels.eventLabels[eventType] ?? eventType}
                            </Badge>
                        ))}
                        <Badge variant="neutral">
                            {labels.version} {destination.version}
                        </Badge>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-4 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                            <dt className="text-text-subtle">{labels.lastDelivery}</dt>
                            <dd className="mt-1 truncate text-sm text-text-strong">
                                {deliveryStatus === null
                                    ? labels.none
                                    : `${deliveryStatus}${deliveryFailure === null ? '' : ` (${deliveryFailure})`}${deliveryAt === null ? '' : ` · ${formatDateTime(deliveryAt) ?? labels.none}`}`}
                            </dd>
                        </div>
                    </dl>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                    <Label htmlFor={`notification-enabled-${destination.id}`} className="text-text-muted">
                        <Switch
                            id={`notification-enabled-${destination.id}`}
                            checked={destination.enabled}
                            disabled={busy}
                            onCheckedChange={onToggle}
                        />
                        {destination.enabled ? labels.enabled : labels.disabled}
                    </Label>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onTest}>
                        {labels.test}
                    </Button>
                </div>
            </div>
            <div className="bg-overlay-subtle p-4">
                <ConfirmRemoveDialog
                    cancelLabel={labels.cancel}
                    confirmationLabel={labels.confirmation}
                    description={labels.removeImpact}
                    disabled={busy}
                    expectedValue={destination.name}
                    inputId={`notification-confirm-${destination.id}`}
                    mismatchLabel={labels.confirmationMismatch}
                    onConfirm={() => onRemove(destination.name)}
                    removeLabel={labels.remove}
                    target={destination.name}
                    title={labels.confirmRemoveTitle}
                    trigger={
                        <Button size="sm" type="button" variant="destructive">
                            {labels.remove}
                        </Button>
                    }
                />
            </div>
        </div>
    )
}
