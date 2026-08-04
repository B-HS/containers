import type { SecretKeyring } from '@containers/config/keyring'
import { asc, desc, eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { notificationDelivery, notificationDestination } from '@containers/db-schema/schema'
import {
    createNotificationDestinationService,
    type NotificationDestinationServiceDb,
} from '../service/domain/notification/create-notification-destination-service'

type ComposeNotificationDestinationDependencies = {
    db: ControlDatabase
    keyring: SecretKeyring
}

export const buildNotificationDestinationServiceDb = (db: ControlDatabase): NotificationDestinationServiceDb => ({
    list: async () => db.select().from(notificationDestination).orderBy(asc(notificationDestination.name)),
    findById: async (id) => {
        const [record] = await db.select().from(notificationDestination).where(eq(notificationDestination.id, id)).limit(1)
        return record
    },
    findByName: async (name) => {
        const [record] = await db.select().from(notificationDestination).where(eq(notificationDestination.name, name)).limit(1)
        return record
    },
    getLastDelivery: async (destinationId) => {
        const [record] = await db
            .select()
            .from(notificationDelivery)
            .where(eq(notificationDelivery.destinationId, destinationId))
            .orderBy(desc(notificationDelivery.createdAt))
            .limit(1)
        return record
    },
    insert: async (record) => {
        await db.insert(notificationDestination).values(record as never)
    },
    update: async (id, values) => {
        await db
            .update(notificationDestination)
            .set(values as never)
            .where(eq(notificationDestination.id, id))
    },
    delete: async (id) => {
        await db.delete(notificationDestination).where(eq(notificationDestination.id, id))
    },
})

export const composeNotificationDestination = ({ db, keyring }: ComposeNotificationDestinationDependencies) => ({
    notificationDestinationService: createNotificationDestinationService({
        db: buildNotificationDestinationServiceDb(db),
        keyring,
        now: () => new Date(),
    }),
})
