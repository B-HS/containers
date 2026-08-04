'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
    useGetNotificationDestinations,
    useRemoveNotificationDestination,
    useSaveNotificationDestination,
    useTestNotificationDestination,
    useToggleNotificationDestination,
} from '@entities/notification/notification.query'
import { NotificationCreateForm } from '@features/notification/notification-create-form'
import { NotificationDetail } from '@features/notification/notification-detail'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import type { NotificationLabels } from './notification-labels'

type NotificationWidgetProps = {
    labels: NotificationLabels
}

const SKELETON_ROW_COUNT = 3

export const NotificationWidget: FC<NotificationWidgetProps> = ({ labels }) => {
    const [busy, setBusy] = useState<string>()
    const { data, isPending } = useGetNotificationDestinations()
    const destinations = data ?? []
    const { onSelect, selectedId, selectedItem: selectedDestination } = useMasterDetailSelection(destinations)
    const saveDestination = useSaveNotificationDestination()
    const testDestination = useTestNotificationDestination()
    const toggleDestination = useToggleNotificationDestination()
    const removeDestination = useRemoveNotificationDestination()

    const toMessage = (error: unknown) => (error instanceof Error ? error.message : labels.failed)

    const save = async (input: { enabled: boolean; eventTypes: string[]; name: string; webhookUrl: string }) => {
        setBusy('save')
        try {
            await saveDestination.mutateAsync(input)
            toast.success(labels.created)
            return true
        } catch (saveError) {
            toast.error(toMessage(saveError))
            return false
        } finally {
            setBusy(undefined)
        }
    }

    const test = async (id: string) => {
        setBusy(id)
        try {
            await testDestination.mutateAsync(id)
            toast.success(labels.testStarted)
        } catch (testError) {
            toast.error(toMessage(testError))
        } finally {
            setBusy(undefined)
        }
    }

    const toggle = async (id: string, enabled: boolean) => {
        setBusy(id)
        try {
            await toggleDestination.mutateAsync({ id, enabled })
            toast.success(labels.updated)
        } catch (toggleError) {
            toast.error(toMessage(toggleError))
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (id: string, confirmation: string) => {
        setBusy(id)
        try {
            await removeDestination.mutateAsync({ id, confirmation })
            toast.success(labels.removed)
        } catch (removeError) {
            toast.error(toMessage(removeError))
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="notification-control-title" title={labels.title} badge={destinations.length}>
            <NotificationCreateForm busy={busy === 'save'} labels={labels} onSave={save} />
            {isPending && (
                <div className="grid gap-px bg-background p-px">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index).map((index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            )}
            {!isPending && destinations.length === 0 && (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {!isPending && destinations.length > 0 && (
                <MasterDetail
                    empty={null}
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
                    {selectedDestination && (
                        <NotificationDetail
                            busy={busy === selectedDestination.id}
                            destination={selectedDestination}
                            labels={labels}
                            onRemove={(confirmation) => void remove(selectedDestination.id, confirmation)}
                            onTest={() => void test(selectedDestination.id)}
                            onToggle={(enabled) => void toggle(selectedDestination.id, enabled)}
                        />
                    )}
                </MasterDetail>
            )}
        </WidgetSection>
    )
}
