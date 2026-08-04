import { eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { notificationDelivery } from '@containers/db-schema/schema'
import { OPERATION_JOB_KIND, type OperationJob } from '@containers/contracts/operation-job'
import type { NotificationDeliverJobPayload } from '@containers/contracts/notification'
import type { NotificationDestinationService } from '../service/domain/notification/create-notification-destination-service'
import {
    createNotificationDeliveryService,
    type NotificationDeliveryServiceDb,
} from '../service/domain/notification/create-notification-delivery-service'

type EnqueueJob = (input: {
    kind: typeof OPERATION_JOB_KIND.NOTIFICATION_DELIVER
    maxAttempts: number
    payload: NotificationDeliverJobPayload
}) => Promise<OperationJob>

type ComposeNotificationDeliveryDependencies = {
    db: ControlDatabase
    destinationService: Pick<NotificationDestinationService, 'list' | 'resolveWebhook'>
    enqueue: EnqueueJob
}

export const buildNotificationDeliveryServiceDb = (db: ControlDatabase): NotificationDeliveryServiceDb => ({
    findById: async (id) => {
        const [record] = await db.select().from(notificationDelivery).where(eq(notificationDelivery.id, id)).limit(1)
        return record
    },
    listQueued: async () => db.select().from(notificationDelivery).where(eq(notificationDelivery.status, 'queued')),
    insert: async (record) => {
        await db.insert(notificationDelivery).values(record as never)
    },
    update: async (id, values) => {
        await db
            .update(notificationDelivery)
            .set(values as never)
            .where(eq(notificationDelivery.id, id))
    },
})

export const composeNotificationDelivery = ({ db, destinationService, enqueue }: ComposeNotificationDeliveryDependencies) => ({
    notificationDeliveryService: createNotificationDeliveryService({
        db: buildNotificationDeliveryServiceDb(db),
        destinationService,
        enqueue,
        now: () => new Date(),
    }),
})
