import type { NotificationDeliveryStatus, NotificationDestination } from '@containers/contracts/notification'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import {
    notificationDestinationDeleteSchema,
    notificationDestinationListSchema,
    notificationDestinationSchema,
    notificationDestinationUpsertSchema,
    notificationDeliverySummarySchema,
} from '@containers/contracts/notification'
import type { SecretKeyring } from '@containers/config/keyring'
import { createAppError } from '../../../lib/error'

type DestinationRow = {
    authenticationTag: string
    ciphertext: string
    createdAt: Date
    createdBy: string
    enabled: boolean
    eventTypes: string
    id: string
    initializationVector: string
    keyVersion: number
    name: string
    type: NotificationDestination['type']
    updatedAt: Date
    version: number
}

type DeliveryRow = {
    createdAt: Date
    failureCode: string | null
    status: NotificationDeliveryStatus
    updatedAt: Date
}

type NotificationDestinationServiceDb = {
    list: () => Promise<DestinationRow[]>
    findById: (id: string) => Promise<DestinationRow | undefined>
    findByName: (name: string) => Promise<DestinationRow | undefined>
    getLastDelivery: (destinationId: string) => Promise<DeliveryRow | undefined>
    insert: (record: DestinationRow) => Promise<void>
    update: (id: string, values: Partial<DestinationRow> & { updatedAt: Date }) => Promise<void>
    delete: (id: string) => Promise<void>
}

type NotificationDestinationServiceDependencies = {
    db: NotificationDestinationServiceDb
    keyring: SecretKeyring
    now: () => Date
}

export type { NotificationDestinationServiceDb }

const toDestination = async (db: NotificationDestinationServiceDb, record: DestinationRow, delivery: DeliveryRow | undefined) =>
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

export const createNotificationDestinationService = ({ db, keyring, now }: NotificationDestinationServiceDependencies) => {
    let activeKeyring = keyring

    const keyOf = (version: number) => {
        const secret = activeKeyring.keys.get(version)
        if (secret === undefined) {
            throw createAppError('SECRET_KEY_VERSION_MISSING')
        }
        return createHash('sha256').update(secret).digest()
    }
    const encrypt = (value: string) => {
        const initializationVector = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', keyOf(activeKeyring.activeVersion), initializationVector)
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
        return {
            authenticationTag: cipher.getAuthTag().toString('base64url'),
            ciphertext: ciphertext.toString('base64url'),
            initializationVector: initializationVector.toString('base64url'),
            keyVersion: activeKeyring.activeVersion,
        }
    }
    const decrypt = (record: DestinationRow) => {
        const decipher = createDecipheriv('aes-256-gcm', keyOf(record.keyVersion), Buffer.from(record.initializationVector, 'base64url'))
        decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'))
        return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
    }
    const findRecord = async (id: string) => {
        const record = await db.findById(id)
        if (!record) {
            throw createAppError('NOTIFICATION_DESTINATION_NOT_FOUND')
        }
        return record
    }
    const getLastDelivery = async (destinationId: string) => db.getLastDelivery(destinationId)

    return {
        list: async () => {
            const records = await db.list()
            const destinations = await Promise.all(records.map(async (record) => toDestination(db, record, await getLastDelivery(record.id))))
            return notificationDestinationListSchema.parse(destinations)
        },
        remove: async (id: string, input: unknown) => {
            const request = notificationDestinationDeleteSchema.parse(input)
            const record = await findRecord(id)
            if (request.confirmation !== record.name) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            await db.delete(id)
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
        rotate: async (nextKeyring: SecretKeyring) => {
            const decrypted = (await db.list()).map((record) => ({ id: record.id, value: decrypt(record) }))
            activeKeyring = nextKeyring
            for (const record of decrypted) {
                await db.update(record.id, { ...encrypt(record.value), updatedAt: now() })
            }
            return { keyVersion: nextKeyring.activeVersion, rotatedCount: decrypted.length }
        },
        setEnabled: async (id: string, enabled: boolean) => {
            const record = await findRecord(id)
            await db.update(id, { enabled, updatedAt: now() })
            return toDestination(db, { ...record, enabled }, await getLastDelivery(id))
        },
        upsert: async (actorId: string, input: unknown) => {
            const request = notificationDestinationUpsertSchema.parse(input)
            const existing = await db.findByName(request.name)
            const encrypted = encrypt(request.webhookUrl)
            const timestamp = now()
            if (existing) {
                await db.update(existing.id, {
                    ...encrypted,
                    enabled: request.enabled,
                    eventTypes: JSON.stringify(request.eventTypes),
                    updatedAt: timestamp,
                    version: existing.version + 1,
                })
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
            await db.insert(record)
            return toDestination(db, record, undefined)
        },
    }
}

export type NotificationDestinationService = ReturnType<typeof createNotificationDestinationService>
