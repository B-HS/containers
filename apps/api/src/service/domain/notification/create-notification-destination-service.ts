import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import {
    notificationDestinationDeleteSchema,
    notificationDestinationListSchema,
    notificationDestinationSchema,
    notificationDestinationUpsertSchema,
    notificationDeliverySummarySchema,
} from '@containers/contracts/notification'
import type { ControlDatabase } from '@containers/db-schema/database'
import { notificationDelivery, notificationDestination } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/app-error'

type NotificationDestinationServiceDependencies = {
    db: ControlDatabase
    masterSecret: string
    now: () => Date
}

const toDestination = async (
    db: ControlDatabase,
    record: typeof notificationDestination.$inferSelect,
    delivery: typeof notificationDelivery.$inferSelect | undefined,
) =>
    notificationDestinationSchema.parse({
        createdAt: record.createdAt.toISOString(),
        enabled: record.enabled,
        eventTypes: JSON.parse(record.eventTypes) as string[],
        id: record.id,
        lastDelivery: notificationDeliverySummarySchema.parse(
            delivery === undefined
                ? { at: null, failureCode: null, status: null }
                : {
                      at: delivery.updatedAt.toISOString(),
                      failureCode: delivery.failureCode,
                      status: delivery.status,
                  },
        ),
        name: record.name,
        type: record.type,
        updatedAt: record.updatedAt.toISOString(),
        version: record.version,
    })

export const createNotificationDestinationService = ({ db, masterSecret, now }: NotificationDestinationServiceDependencies) => {
    const key = createHash('sha256').update(masterSecret).digest()
    const encrypt = (value: string) => {
        const initializationVector = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, initializationVector)
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
        return {
            authenticationTag: cipher.getAuthTag().toString('base64url'),
            ciphertext: ciphertext.toString('base64url'),
            initializationVector: initializationVector.toString('base64url'),
        }
    }
    const decrypt = (record: typeof notificationDestination.$inferSelect) => {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.initializationVector, 'base64url'))
        decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'))
        return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
    }
    const findRecord = async (id: string) => {
        const [record] = await db.select().from(notificationDestination).where(eq(notificationDestination.id, id)).limit(1)
        if (!record) {
            throw createAppError('NOTIFICATION_DESTINATION_NOT_FOUND')
        }
        return record
    }
    const getLastDelivery = async (destinationId: string) => {
        const [delivery] = await db
            .select()
            .from(notificationDelivery)
            .where(eq(notificationDelivery.destinationId, destinationId))
            .orderBy(desc(notificationDelivery.createdAt))
            .limit(1)
        return delivery
    }

    return {
        list: async () => {
            const records = await db.select().from(notificationDestination).orderBy(asc(notificationDestination.name))
            const destinations = await Promise.all(records.map(async (record) => toDestination(db, record, await getLastDelivery(record.id))))
            return notificationDestinationListSchema.parse(destinations)
        },
        remove: async (id: string, input: unknown) => {
            const request = notificationDestinationDeleteSchema.parse(input)
            const record = await findRecord(id)
            if (request.confirmation !== record.name) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            await db.delete(notificationDestination).where(eq(notificationDestination.id, id))
            return toDestination(db, record, await getLastDelivery(id))
        },
        resolveWebhook: async (id: string) => {
            const record = await findRecord(id)
            try {
                return { enabled: record.enabled, name: record.name, webhookUrl: decrypt(record) }
            } catch {
                throw createAppError('NOTIFICATION_DESTINATION_DECRYPTION_FAILED')
            }
        },
        setEnabled: async (id: string, enabled: boolean) => {
            const record = await findRecord(id)
            await db.update(notificationDestination).set({ enabled, updatedAt: now() }).where(eq(notificationDestination.id, id))
            return toDestination(db, { ...record, enabled }, await getLastDelivery(id))
        },
        upsert: async (actorId: string, input: unknown) => {
            const request = notificationDestinationUpsertSchema.parse(input)
            const [existing] = await db.select().from(notificationDestination).where(eq(notificationDestination.name, request.name)).limit(1)
            const encrypted = encrypt(request.webhookUrl)
            const timestamp = now()
            if (existing) {
                await db
                    .update(notificationDestination)
                    .set({
                        ...encrypted,
                        enabled: request.enabled,
                        eventTypes: JSON.stringify(request.eventTypes),
                        updatedAt: timestamp,
                        version: existing.version + 1,
                    })
                    .where(eq(notificationDestination.id, existing.id))
                return toDestination(
                    db,
                    {
                        ...existing,
                        ...encrypted,
                        enabled: request.enabled,
                        eventTypes: JSON.stringify(request.eventTypes),
                        updatedAt: timestamp,
                        version: existing.version + 1,
                    },
                    await getLastDelivery(existing.id),
                )
            }
            const record = {
                ...encrypted,
                createdAt: timestamp,
                createdBy: actorId,
                enabled: request.enabled,
                eventTypes: JSON.stringify(request.eventTypes),
                id: randomUUID(),
                name: request.name,
                type: request.type,
                updatedAt: timestamp,
                version: 1,
            }
            await db.insert(notificationDestination).values(record)
            return toDestination(db, record, undefined)
        },
    }
}

export type NotificationDestinationService = ReturnType<typeof createNotificationDestinationService>
