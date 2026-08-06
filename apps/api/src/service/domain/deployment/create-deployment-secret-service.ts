import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import {
    deploymentSecretBindingSchema,
    deploymentSecretDeleteSchema,
    deploymentSecretListSchema,
    deploymentSecretSchema,
    deploymentSecretUpsertSchema,
    type DeploymentSecretBinding,
} from '@containers/contracts/deployment-secret'
import type { SecretKeyring } from '@containers/config/keyring'
import { createAppError } from '../../../lib/error'

type SecretRow = {
    authenticationTag: string
    ciphertext: string
    createdAt: Date
    createdBy: string | null
    id: string
    initializationVector: string
    keyVersion: number
    reference: string
    updatedAt: Date
    version: number
}

type ManifestSecretReference = {
    id: string
    secretsJson: string
}

type DeploymentSecretServiceDb = {
    list: () => Promise<SecretRow[]>
    findByReference: (reference: string) => Promise<SecretRow | undefined>
    findById: (id: string) => Promise<SecretRow | undefined>
    listManifestSecretReferences: () => Promise<ManifestSecretReference[]>
    findByReferences: (references: string[]) => Promise<SecretRow[]>
    insert: (record: {
        authenticationTag: string
        ciphertext: string
        createdAt: Date
        createdBy: string
        id: string
        initializationVector: string
        keyVersion: number
        reference: string
        updatedAt: Date
        version: number
    }) => Promise<void>
    update: (
        id: string,
        values: {
            authenticationTag: string
            ciphertext: string
            initializationVector: string
            keyVersion: number
            updatedAt: Date
            version: number
        },
    ) => Promise<void>
    rekey: (id: string, values: { authenticationTag: string; ciphertext: string; initializationVector: string; keyVersion: number }) => Promise<void>
    delete: (id: string) => Promise<void>
}

type DeploymentSecretServiceDependencies = {
    db: DeploymentSecretServiceDb
    keyring: SecretKeyring
    now: () => Date
}

export type { DeploymentSecretServiceDb }

const toSecret = (record: SecretRow) =>
    deploymentSecretSchema.parse({
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        reference: record.reference,
        updatedAt: record.updatedAt.toISOString(),
        version: record.version,
    })

export const createDeploymentSecretService = ({ db, keyring, now }: DeploymentSecretServiceDependencies) => {
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
    const decrypt = (record: SecretRow) => {
        const decipher = createDecipheriv('aes-256-gcm', keyOf(record.keyVersion), Buffer.from(record.initializationVector, 'base64url'))
        decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'))
        return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
    }

    return {
        list: async () => deploymentSecretListSchema.parse((await db.list()).map(toSecret)),
        remove: async (id: string, input: unknown) => {
            const request = deploymentSecretDeleteSchema.parse(input)
            const record = await db.findById(id)
            if (!record) {
                throw createAppError('DEPLOYMENT_SECRET_NOT_FOUND')
            }
            if (request.confirmation !== record.reference) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            const manifests = await db.listManifestSecretReferences()
            const used = manifests.some((manifest) => {
                const bindings = deploymentSecretBindingSchema.array().parse(JSON.parse(manifest.secretsJson))
                return bindings.some((binding) => binding.reference === record.reference)
            })
            if (used) {
                throw createAppError('DEPLOYMENT_SECRET_IN_USE')
            }
            await db.delete(id)
            return toSecret(record)
        },
        resolve: async (bindings: DeploymentSecretBinding[]) => {
            const parsedBindings = deploymentSecretBindingSchema.array().parse(bindings)
            if (parsedBindings.length === 0) {
                return []
            }
            const references = [...new Set(parsedBindings.map((binding) => binding.reference))]
            const records = await db.findByReferences(references)
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
        rotate: async (nextKeyring: SecretKeyring) => {
            const decrypted = (await db.list()).map((record) => ({ id: record.id, value: decrypt(record) }))
            activeKeyring = nextKeyring
            for (const record of decrypted) {
                await db.rekey(record.id, encrypt(record.value))
            }
            return { keyVersion: nextKeyring.activeVersion, rotatedCount: decrypted.length }
        },
        upsert: async (actorId: string, input: unknown) => {
            const request = deploymentSecretUpsertSchema.parse(input)
            const existing = await db.findByReference(request.reference)
            const encrypted = encrypt(request.value)
            const timestamp = now()
            if (existing) {
                await db.update(existing.id, { ...encrypted, updatedAt: timestamp, version: existing.version + 1 })
                const updated = await db.findById(existing.id)
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
            await db.insert(record)
            return toSecret(record)
        },
    }
}

export type DeploymentSecretService = ReturnType<typeof createDeploymentSecretService>
