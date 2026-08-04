import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getNotificationDestinations } from '@entities/notification/notification.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { NotificationWidget } from '@widgets/notification/notification-widget'

const NotificationsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.NOTIFICATION.LIST,
        queryFn: () =>
            session.canManageApiKeys ? getNotificationDestinations(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([]),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.notifications')} title={navTranslations('items.notifications')} />
                <NotificationWidget
                    labels={{
                        cancel: translations('cancel'),
                        confirmation: translations('notificationConfirmation'),
                        confirmRemoveTitle: translations('confirmRemoveTitle'),
                        created: translations('created'),
                        destinationCreate: translations('notificationDestinationCreate'),
                        disabled: translations('notificationDisabled'),
                        empty: translations('notificationEmpty'),
                        emptyDescription: translations('notificationEmptyDescription'),
                        enabled: translations('notificationEnabled'),
                        eventBackupFailed: translations('notificationEventBackupFailed'),
                        failed: translations('notificationFailed'),
                        lastDelivery: translations('notificationLastDelivery'),
                        name: translations('notificationName'),
                        none: translations('notificationNone'),
                        remove: translations('remove'),
                        removed: translations('removed'),
                        removeImpact: translations('notificationRemoveImpact'),
                        save: translations('notificationSave'),
                        test: translations('notificationTest'),
                        testStarted: translations('notificationTestStarted'),
                        title: translations('notificationControl'),
                        updated: translations('updated'),
                        version: translations('notificationVersion'),
                        webhookUrl: translations('notificationWebhookUrl'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default NotificationsPage
