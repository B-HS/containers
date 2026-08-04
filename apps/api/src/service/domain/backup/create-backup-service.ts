import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
    BACKUP_MANIFEST_SCHEMA_VERSION,
    BACKUP_RESTORE_MODE,
    backupCreateSchema,
    backupDeleteSchema,
    backupListSchema,
    backupManifestSchema,
    backupRestoreSchema,
    backupSecretBundleSchema,
    backupSecretEnvelopeSchema,
    type BackupManifest,
    type BackupRestoreMode,
    type BackupSecretBundle,
} from '@containers/contracts/backup'
import { createAppError } from '../../../lib/error'
import type { TrafficWorkerClient } from '../../../service/shared/traffic-worker-client/create-traffic-worker-client'

type BackupServiceDb = {
    checkForeignKeys: () => Promise<void>
    restoreControlSnapshot: (filePath: string, mode: BackupRestoreMode) => Promise<void>
    snapshot: () => Uint8Array
    validateControlSnapshot: (filePath: string) => Promise<void>
}

type BackupSecretKeyFiles = {
    deployment: string
    notification: string
}

type BackupServiceDependencies = {
    backupRoot: string
    db: BackupServiceDb
    nginxConfigProvider: () => Promise<string>
    now: () => Date
    retentionCount: number
    secretKeyFiles: BackupSecretKeyFiles
    trafficWorkerClient: Pick<TrafficWorkerClient, 'createBackup' | 'restoreBackup'>
}

export type { BackupServiceDb }

const SECRET_ENVELOPE_VERSION = 1
const SECRET_KDF_BLOCK_SIZE = 8
const SECRET_KDF_COST = 16_384
const SECRET_KDF_PARALLELIZATION = 1
const SECRET_KDF_MAX_MEMORY_BYTES = 64 * 1_024 * 1_024
const SECRET_KEY_LENGTH = 32
const SECRET_SALT_LENGTH = 16
const SECRET_INITIALIZATION_VECTOR_LENGTH = 12
const SECRET_KEY_FILE_MODE = 0o600
const RESTORE_PASSPHRASE_TTL_MS = 15 * 60 * 1_000

const sha256File = async (filePath: string) => {
    const hash = createHash('sha256')
    const reader = Bun.file(filePath).stream().getReader()
    while (true) {
        const result = await reader.read()
        if (result.done) {
            break
        }
        hash.update(result.value)
    }
    return hash.digest('hex')
}

const writeAtomic = async (filePath: string, content: Uint8Array | string) => {
    const temporaryPath = `${filePath}.tmp`
    await Bun.write(temporaryPath, content)
    await rename(temporaryPath, filePath)
}

const deriveSecretKey = (passphrase: string, salt: Buffer) =>
    scryptSync(passphrase, salt, SECRET_KEY_LENGTH, {
        blockSize: SECRET_KDF_BLOCK_SIZE,
        cost: SECRET_KDF_COST,
        maxmem: SECRET_KDF_MAX_MEMORY_BYTES,
        parallelization: SECRET_KDF_PARALLELIZATION,
    })

const encryptSecretBundle = (bundle: BackupSecretBundle, passphrase: string) => {
    const salt = randomBytes(SECRET_SALT_LENGTH)
    const initializationVector = randomBytes(SECRET_INITIALIZATION_VECTOR_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', deriveSecretKey(passphrase, salt), initializationVector)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final()])
    return backupSecretEnvelopeSchema.parse({
        algorithm: 'aes-256-gcm',
        authenticationTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        initializationVector: initializationVector.toString('base64'),
        kdf: 'scrypt',
        kdfBlockSize: SECRET_KDF_BLOCK_SIZE,
        kdfCost: SECRET_KDF_COST,
        kdfParallelization: SECRET_KDF_PARALLELIZATION,
        salt: salt.toString('base64'),
        version: SECRET_ENVELOPE_VERSION,
    })
}

const decryptSecretBundle = (envelopeInput: unknown, passphrase: string) => {
    const envelope = backupSecretEnvelopeSchema.safeParse(envelopeInput)
    if (!envelope.success) {
        throw createAppError('BACKUP_SECRET_UNAVAILABLE')
    }
    try {
        const key = scryptSync(passphrase, Buffer.from(envelope.data.salt, 'base64'), SECRET_KEY_LENGTH, {
            blockSize: envelope.data.kdfBlockSize,
            cost: envelope.data.kdfCost,
            maxmem: SECRET_KDF_MAX_MEMORY_BYTES,
            parallelization: envelope.data.kdfParallelization,
        })
        const decipher = createDecipheriv(envelope.data.algorithm, key, Buffer.from(envelope.data.initializationVector, 'base64'))
        decipher.setAuthTag(Buffer.from(envelope.data.authenticationTag, 'base64'))
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data.ciphertext, 'base64')), decipher.final()])
        return backupSecretBundleSchema.parse(JSON.parse(plaintext.toString('utf8')))
    } catch {
        throw createAppError('BACKUP_SECRET_PASSPHRASE_INVALID')
    }
}

export const createBackupService = ({
    backupRoot,
    db,
    nginxConfigProvider,
    now,
    retentionCount,
    secretKeyFiles,
    trafficWorkerClient,
}: BackupServiceDependencies) => {
    const manifestPath = (id: string) => join(backupRoot, id, 'manifest.json')
    const controlPath = (id: string) => join(backupRoot, id, 'control.sqlite')
    const trafficPath = (id: string) => join(backupRoot, id, 'traffic.sqlite')
    const nginxPath = (id: string) => join(backupRoot, id, 'nginx.conf')
    const secretsPath = (id: string) => join(backupRoot, id, 'secrets.enc')

    const stagedPassphrases = new Map<string, { expiresAt: number; passphrase: string }>()

    const stageRestoreSecret = (id: string, passphrase: string) => {
        stagedPassphrases.set(id, { expiresAt: now().getTime() + RESTORE_PASSPHRASE_TTL_MS, passphrase })
    }

    const consumeStagedSecret = (id: string) => {
        const staged = stagedPassphrases.get(id)
        stagedPassphrases.delete(id)
        if (staged === undefined || staged.expiresAt <= now().getTime()) {
            return null
        }
        return staged.passphrase
    }

    const list = async () => {
        await mkdir(backupRoot, { recursive: true })
        const entries = await readdir(backupRoot, { withFileTypes: true })
        const manifests = await Promise.all(
            entries
                .filter((entry) => entry.isDirectory())
                .map(async (entry) => {
                    try {
                        return backupManifestSchema.parse(await Bun.file(manifestPath(entry.name)).json())
                    } catch {
                        return undefined
                    }
                }),
        )
        return backupListSchema.parse(
            manifests
                .filter((manifest): manifest is BackupManifest => Boolean(manifest))
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        )
    }

    const cleanupRetention = async () => {
        const expired = (await list()).slice(retentionCount)
        await Promise.all(expired.map((manifest) => rm(join(backupRoot, manifest.id), { force: true, recursive: true })))
    }

    const captureNginxConfig = async (id: string) => {
        try {
            const config = Buffer.from(await nginxConfigProvider(), 'utf8')
            await writeAtomic(nginxPath(id), config)
            return { bytes: config.byteLength, sha256: createHash('sha256').update(config).digest('hex') }
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: 'backup.nginx_config.skipped',
                    id,
                    message: error instanceof Error ? error.message : 'NGINX_CONFIG_UNAVAILABLE',
                }),
            )
            return null
        }
    }

    const captureSecretBundle = async (id: string, passphrase: string) => {
        let bundle: BackupSecretBundle
        try {
            const [deploymentSecretKey, notificationSecretKey] = await Promise.all([
                readFile(secretKeyFiles.deployment, 'utf8'),
                readFile(secretKeyFiles.notification, 'utf8'),
            ])
            bundle = backupSecretBundleSchema.parse({
                deploymentSecretKey: deploymentSecretKey.trim(),
                notificationSecretKey: notificationSecretKey.trim(),
            })
        } catch {
            throw createAppError('BACKUP_SECRET_UNAVAILABLE')
        }
        const envelope = Buffer.from(JSON.stringify(encryptSecretBundle(bundle, passphrase)), 'utf8')
        await writeAtomic(secretsPath(id), envelope)
        return { bytes: envelope.byteLength, sha256: createHash('sha256').update(envelope).digest('hex') }
    }

    const writeSecretKeyFiles = async (bundle: BackupSecretBundle) => {
        await Promise.all([
            writeFile(secretKeyFiles.deployment, bundle.deploymentSecretKey, { encoding: 'utf8', mode: SECRET_KEY_FILE_MODE }),
            writeFile(secretKeyFiles.notification, bundle.notificationSecretKey, { encoding: 'utf8', mode: SECRET_KEY_FILE_MODE }),
        ])
        await Promise.all([chmod(secretKeyFiles.deployment, SECRET_KEY_FILE_MODE), chmod(secretKeyFiles.notification, SECRET_KEY_FILE_MODE)])
    }

    const createSnapshot = async (input: unknown, applyRetention: boolean) => {
        const payload = backupCreateSchema.parse(input)
        await db.checkForeignKeys()
        const id = randomUUID()
        const directory = join(backupRoot, id)
        await mkdir(directory, { recursive: true })
        try {
            const traffic = await trafficWorkerClient.createBackup(id)
            const controlSnapshot = db.snapshot()
            await writeAtomic(controlPath(id), controlSnapshot)
            const nginx = await captureNginxConfig(id)
            const secrets = payload.passphrase === null ? null : await captureSecretBundle(id, payload.passphrase)
            const manifest = backupManifestSchema.parse({
                controlBytes: controlSnapshot.byteLength,
                controlSha256: createHash('sha256').update(controlSnapshot).digest('hex'),
                createdAt: now().toISOString(),
                id,
                label: payload.label,
                nginxBytes: nginx?.bytes ?? null,
                nginxSha256: nginx?.sha256 ?? null,
                schemaVersion: BACKUP_MANIFEST_SCHEMA_VERSION,
                secretsBytes: secrets?.bytes ?? null,
                secretsIncluded: secrets !== null,
                secretsSha256: secrets?.sha256 ?? null,
                trafficBytes: traffic.bytes,
                trafficSha256: traffic.sha256,
            })
            await writeAtomic(manifestPath(id), JSON.stringify(manifest))
            if (applyRetention) {
                await cleanupRetention()
            }
            return manifest
        } catch (error) {
            await rm(directory, { force: true, recursive: true })
            throw error
        }
    }

    const verifyOptionalFile = async (filePath: string, bytes: number | null, sha256: string | null) => {
        if (bytes === null || sha256 === null) {
            return
        }
        const [fileStat, digest] = await Promise.all([stat(filePath), sha256File(filePath)]).catch(() => {
            throw createAppError('BACKUP_INCOMPLETE')
        })
        if (fileStat.size !== bytes || digest !== sha256) {
            throw createAppError('BACKUP_DIGEST_MISMATCH')
        }
    }

    const getVerified = async (id: string) => {
        let manifest: BackupManifest
        try {
            manifest = backupManifestSchema.parse(await Bun.file(manifestPath(id)).json())
        } catch {
            throw createAppError('BACKUP_NOT_FOUND')
        }
        const [controlStat, trafficStat, controlSha256, trafficSha256] = await Promise.all([
            stat(controlPath(id)),
            stat(trafficPath(id)),
            sha256File(controlPath(id)),
            sha256File(trafficPath(id)),
        ]).catch(() => {
            throw createAppError('BACKUP_INCOMPLETE')
        })
        if (
            controlStat.size !== manifest.controlBytes ||
            trafficStat.size !== manifest.trafficBytes ||
            controlSha256 !== manifest.controlSha256 ||
            trafficSha256 !== manifest.trafficSha256
        ) {
            throw createAppError('BACKUP_DIGEST_MISMATCH')
        }
        await verifyOptionalFile(nginxPath(id), manifest.nginxBytes, manifest.nginxSha256)
        await verifyOptionalFile(secretsPath(id), manifest.secretsBytes, manifest.secretsSha256)
        await db.validateControlSnapshot(controlPath(id))
        return manifest
    }

    const loadSecretBundle = async (id: string, manifest: BackupManifest, passphrase: string | null) => {
        if (passphrase === null) {
            return null
        }
        if (!manifest.secretsIncluded) {
            throw createAppError('BACKUP_SECRET_NOT_INCLUDED')
        }
        let envelope: unknown
        try {
            envelope = await Bun.file(secretsPath(id)).json()
        } catch {
            throw createAppError('BACKUP_SECRET_UNAVAILABLE')
        }
        return decryptSecretBundle(envelope, passphrase)
    }

    return {
        create: (input: unknown) => createSnapshot(input, true),
        list,
        remove: async (id: string, input: unknown) => {
            const payload = backupDeleteSchema.parse(input)
            if (payload.confirmation !== id) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            try {
                const manifest = backupManifestSchema.parse(await Bun.file(manifestPath(id)).json())
                if (manifest.id !== id) {
                    throw createAppError('BACKUP_NOT_FOUND')
                }
            } catch (error) {
                throw createAppError('BACKUP_NOT_FOUND', error)
            }
            await rm(join(backupRoot, id), { recursive: true })
            return { removed: true as const }
        },
        restore: async (id: string, input: unknown) => {
            const payload = backupRestoreSchema.parse(input)
            if (payload.confirmation !== id) {
                throw createAppError('CONFIRMATION_MISMATCH')
            }
            const manifest = await getVerified(id)
            const secretBundle = await loadSecretBundle(id, manifest, payload.passphrase ?? consumeStagedSecret(id))
            const recovery = await createSnapshot({ label: `pre-restore:${id}` }, false)
            try {
                const traffic = await trafficWorkerClient.restoreBackup(id)
                if (traffic.bytes !== manifest.trafficBytes || traffic.sha256 !== manifest.trafficSha256) {
                    throw createAppError('BACKUP_TRAFFIC_DIGEST_MISMATCH')
                }
                await db.restoreControlSnapshot(controlPath(id), payload.mode)
                if (secretBundle !== null) {
                    await writeSecretKeyFiles(secretBundle)
                }
                await cleanupRetention()
                return {
                    backup: manifest,
                    mode: payload.mode,
                    recoveryBackupId: recovery.id,
                    restored: true as const,
                    secretsRestored: secretBundle !== null,
                }
            } catch (error) {
                try {
                    await trafficWorkerClient.restoreBackup(recovery.id)
                    await db.restoreControlSnapshot(controlPath(recovery.id), BACKUP_RESTORE_MODE.FULL)
                } catch (rollbackError) {
                    console.error(
                        JSON.stringify({
                            event: 'backup.restore.rollback_failed',
                            originalCode: error instanceof Error ? error.message.split(':')[0] : 'BACKUP_RESTORE_FAILED',
                            rollbackCode: rollbackError instanceof Error ? rollbackError.message.split(':')[0] : 'BACKUP_ROLLBACK_FAILED',
                        }),
                    )
                    throw createAppError('BACKUP_RESTORE_ROLLBACK_FAILED', rollbackError)
                }
                throw error
            }
        },
        stageRestoreSecret,
    }
}

export type BackupService = ReturnType<typeof createBackupService>
