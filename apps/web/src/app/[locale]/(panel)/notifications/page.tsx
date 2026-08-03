import { getTranslations } from 'next-intl/server'
import { getNotificationDestinations } from '@entities/notification/notification.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { NotificationWidget } from '@widgets/notification/notification-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const NotificationsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const destinations = session.canManageApiKeys ? await getNotificationDestinations(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.notifications')} title={navTranslations('items.notifications')} />
            <NotificationWidget
                destinations={destinations}
                labels={{
                    confirmation: translations('notificationConfirmation'),
                    disabled: translations('notificationDisabled'),
                    empty: translations('notificationEmpty'),
                    enabled: translations('notificationEnabled'),
                    eventBackupFailed: translations('notificationEventBackupFailed'),
                    failed: translations('notificationFailed'),
                    lastDelivery: translations('notificationLastDelivery'),
                    name: translations('notificationName'),
                    none: translations('notificationNone'),
                    remove: translations('remove'),
                    save: translations('notificationSave'),
                    test: translations('notificationTest'),
                    testStarted: translations('notificationTestStarted'),
                    title: translations('notificationControl'),
                    version: translations('notificationVersion'),
                    webhookUrl: translations('notificationWebhookUrl'),
                }}
            />
        </div>
    )
}

export default NotificationsPage
