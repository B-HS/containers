import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
    registryCredentialDeleteSchema,
    registryCredentialListSchema,
    registryCredentialSchema,
    registryCredentialUpsertSchema,
} from '@containers/contracts/registry-credential'
import { createAppError } from '../../lib/error'

const encryptedRegistryCredentialSchema = z.object({
    authenticationTag: z.string().min(1),
    ciphertext: z.string().min(1),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    initializationVector: z.string().min(1),
    name: z.string().min(1).max(100),
    serverAddress: z.string().min(1),
    updatedAt: z.iso.datetime(),
    username: z.string().min(1).max(256),
    version: z.number().int().positive(),
})

const registryCredentialStoreSchema = z.object({ records: z.array(encryptedRegistryCredentialSchema), version: z.literal(1) })
type EncryptedRegistryCredential = z.infer<typeof encryptedRegistryCredentialSchema>

type RegistryCredentialServiceDependencies = {
    filePath: string
    masterSecret: string
    now: () => Date
    randomId?: () => string
}

const normalizeRegistryHost = (reference: string) => {
    const first = reference.split('/')[0]?.toLowerCase() ?? ''
    return first === 'localhost' || first.includes('.') || first.includes(':') ? first : 'docker.io'
}

export const createRegistryCredentialService = ({ filePath, masterSecret, now, randomId = randomUUID }: RegistryCredentialServiceDependencies) => {
    const key = createHash('sha256').update(masterSecret).digest()
    let mutation = Promise.resolve()

    const readStore = async () => {
        try {
            return registryCredentialStoreSchema.parse(JSON.parse(await readFile(filePath, 'utf8')))
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                return { records: [], version: 1 as const }
            }
            throw createAppError('REGISTRY_CREDENTIAL_STORE_INVALID', error)
        }
    }

    const writeStore = async (records: EncryptedRegistryCredential[]) => {
        await mkdir(dirname(filePath), { recursive: true })
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`
        await writeFile(temporaryPath, JSON.stringify({ records, version: 1 }), { encoding: 'utf8', mode: 0o600 })
        await chmod(temporaryPath, 0o600)
        await rename(temporaryPath, filePath)
    }

    const serialize = (record: EncryptedRegistryCredential) =>
        registryCredentialSchema.parse({
            createdAt: record.createdAt,
            id: record.id,
            name: record.name,
            serverAddress: record.serverAddress,
            updatedAt: record.updatedAt,
            username: record.username,
            version: record.version,
        })

    const encrypt = (password: string) => {
        const initializationVector = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, initializationVector)
        const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
        return {
            authenticationTag: cipher.getAuthTag().toString('base64url'),
            ciphertext: ciphertext.toString('base64url'),
            initializationVector: initializationVector.toString('base64url'),
        }
    }

    const decrypt = (record: EncryptedRegistryCredential) => {
        try {
            const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.initializationVector, 'base64url'))
            decipher.setAuthTag(Buffer.from(record.authenticationTag, 'base64url'))
            return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
        } catch (error) {
            throw createAppError('REGISTRY_CREDENTIAL_DECRYPTION_FAILED', error)
        }
    }

    const withMutation = async <T>(operation: () => Promise<T>) => {
        const result = mutation.then(operation, operation)
        mutation = result.then(
            () => undefined,
            () => undefined,
        )
        return result
    }

    return {
        getRegistryAuth: async (credentialId: string, reference: string) => {
            const store = await readStore()
            const record = store.records.find((candidate) => candidate.id === credentialId)
            if (!record) throw createAppError('REGISTRY_CREDENTIAL_NOT_FOUND')
            if (normalizeRegistryHost(reference) !== record.serverAddress) throw createAppError('REGISTRY_HOST_MISMATCH')
            return Buffer.from(
                JSON.stringify({ password: decrypt(record), serveraddress: record.serverAddress, username: record.username }),
                'utf8',
            ).toString('base64url')
        },
        list: async () => registryCredentialListSchema.parse((await readStore()).records.map(serialize).sort((a, b) => a.name.localeCompare(b.name))),
        remove: async (credentialId: string, input: unknown) =>
            withMutation(async () => {
                const request = registryCredentialDeleteSchema.parse(input)
                const store = await readStore()
                const record = store.records.find((candidate) => candidate.id === credentialId)
                if (!record) throw createAppError('REGISTRY_CREDENTIAL_NOT_FOUND')
                if (request.confirmation !== record.name) throw createAppError('CONFIRMATION_MISMATCH')
                await writeStore(store.records.filter((candidate) => candidate.id !== credentialId))
                return serialize(record)
            }),
        upsert: async (credentialId: string | undefined, input: unknown) =>
            withMutation(async () => {
                const request = registryCredentialUpsertSchema.parse(input)
                const store = await readStore()
                const existing = credentialId === undefined ? undefined : store.records.find((candidate) => candidate.id === credentialId)
                if (credentialId !== undefined && !existing) throw createAppError('REGISTRY_CREDENTIAL_NOT_FOUND')
                const timestamp = now().toISOString()
                const record: EncryptedRegistryCredential = {
                    ...encrypt(request.password),
                    createdAt: existing?.createdAt ?? timestamp,
                    id: existing?.id ?? randomId(),
                    name: request.name,
                    serverAddress: request.serverAddress,
                    updatedAt: timestamp,
                    username: request.username,
                    version: (existing?.version ?? 0) + 1,
                }
                await writeStore([...store.records.filter((candidate) => candidate.id !== record.id), record])
                return serialize(record)
            }),
    }
}

export type RegistryCredentialService = ReturnType<typeof createRegistryCredentialService>
