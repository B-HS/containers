import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { asc, eq, inArray } from 'drizzle-orm'
import {
    deploymentSecretBindingSchema,
    deploymentSecretDeleteSchema,
    deploymentSecretListSchema,
    deploymentSecretSchema,
    deploymentSecretUpsertSchema,
    type DeploymentSecretBinding,
} from '@containers/contracts/deployment-secret'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, deploymentSecret } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/app-error'

type DeploymentSecretServiceDependencies = {
    db: ControlDatabase
    masterSecret: string
    now: () => Date
}

const toSecret = (record: typeof deploymentSecret.$inferSelect) =>
    deploymentSecretSchema.parse({
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        reference: record.reference,
        updatedAt: record.updatedAt.toISOString(),
        version: record.version,
    })

export const createDeploymentSecretService = ({ db, masterSecret, now }: DeploymentSecretServiceDependencies) => {
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
    const decrypt = (record: typeof deploymentSecret.$inferSelect) => {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.initializationVector, 'base64url'))
        decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'))
        return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
    }

    return {
        list: async () =>
            deploymentSecretListSchema.parse((await db.select().from(deploymentSecret).orderBy(asc(deploymentSecret.reference))).map(toSecret)),
        remove: async (id: string, input: unknown) => {
            const request = deploymentSecretDeleteSchema.parse(input)
            const [record] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.id, id)).limit(1)
            if (!record) {
                throw createAppError('DEPLOYMENT_SECRET_NOT_FOUND')
            }
            if (request.confirmation !== record.reference) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            const manifests = await db.select({ id: deploymentManifest.id, secretsJson: deploymentManifest.secretsJson }).from(deploymentManifest)
            const used = manifests.some((manifest) => {
                const bindings = deploymentSecretBindingSchema.array().parse(JSON.parse(manifest.secretsJson))
                return bindings.some((binding) => binding.reference === record.reference)
            })
            if (used) {
                throw createAppError('DEPLOYMENT_SECRET_IN_USE')
            }
            await db.delete(deploymentSecret).where(eq(deploymentSecret.id, id))
            return toSecret(record)
        },
        resolve: async (bindings: DeploymentSecretBinding[]) => {
            const parsedBindings = deploymentSecretBindingSchema.array().parse(bindings)
            if (parsedBindings.length === 0) {
                return []
            }
            const references = [...new Set(parsedBindings.map((binding) => binding.reference))]
            const records = await db.select().from(deploymentSecret).where(inArray(deploymentSecret.reference, references))
            const recordsByReference = new Map(records.map((record) => [record.reference, record]))
            return parsedBindings.map((binding) => {
                const record = recordsByReference.get(binding.reference)
                if (!record) {
                    throw createAppError('DEPLOYMENT_SECRET_UNRESOLVED')
                }
                try {
                    return `${binding.environmentKey}=${decrypt(record)}`
                } catch {
                    throw createAppError('DEPLOYMENT_SECRET_DECRYPTION_FAILED')
                }
            })
        },
        upsert: async (actorId: string, input: unknown) => {
            const request = deploymentSecretUpsertSchema.parse(input)
            const [existing] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.reference, request.reference)).limit(1)
            const encrypted = encrypt(request.value)
            const timestamp = now()
            if (existing) {
                await db
                    .update(deploymentSecret)
                    .set({ ...encrypted, updatedAt: timestamp, version: existing.version + 1 })
                    .where(eq(deploymentSecret.id, existing.id))
                const [updated] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.id, existing.id)).limit(1)
                if (!updated) {
                    throw createAppError('DEPLOYMENT_SECRET_NOT_FOUND')
                }
                return toSecret(updated)
            }
            const record = {
                ...encrypted,
                createdAt: timestamp,
                createdBy: actorId,
                id: randomUUID(),
                reference: request.reference,
                updatedAt: timestamp,
                version: 1,
            }
            await db.insert(deploymentSecret).values(record)
            return toSecret(record)
        },
    }
}

export type DeploymentSecretService = ReturnType<typeof createDeploymentSecretService>
