import { z } from 'zod'

export const BACKUP_MANIFEST_SCHEMA_VERSION = 2

export const BACKUP_RESTORE_MODE = {
    FULL: 'full',
    PRESERVE_HOST: 'preserve-host',
} as const

export type BackupRestoreMode = (typeof BACKUP_RESTORE_MODE)[keyof typeof BACKUP_RESTORE_MODE]

const PASSPHRASE_MIN_LENGTH = 12
const PASSPHRASE_MAX_LENGTH = 256

export const backupIdSchema = z.uuid()

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const backupPassphraseSchema = z.string().min(PASSPHRASE_MIN_LENGTH).max(PASSPHRASE_MAX_LENGTH)

export const backupRestoreModeSchema = z.enum([BACKUP_RESTORE_MODE.FULL, BACKUP_RESTORE_MODE.PRESERVE_HOST])

export const trafficBackupParamSchema = z.object({
    id: backupIdSchema,
})

export const backupCreateSchema = z.object({
    label: z.string().trim().min(1).max(100).nullable().default(null),
    passphrase: backupPassphraseSchema.nullable().default(null),
})

export const backupManifestSchema = z.object({
    controlBytes: z.number().int().nonnegative(),
    controlSha256: sha256Schema,
    createdAt: z.iso.datetime(),
    id: backupIdSchema,
    label: z.string().nullable(),
    nginxBytes: z.number().int().nonnegative().nullable().default(null),
    nginxSha256: sha256Schema.nullable().default(null),
    schemaVersion: z.union([z.literal(1), z.literal(BACKUP_MANIFEST_SCHEMA_VERSION)]),
    secretsBytes: z.number().int().nonnegative().nullable().default(null),
    secretsIncluded: z.boolean().default(false),
    secretsSha256: sha256Schema.nullable().default(null),
    trafficBytes: z.number().int().nonnegative(),
    trafficSha256: sha256Schema,
})

export const backupListSchema = z.array(backupManifestSchema)

export const backupRestoreSchema = z.object({
    confirmation: backupIdSchema,
    mode: backupRestoreModeSchema.default(BACKUP_RESTORE_MODE.PRESERVE_HOST),
    passphrase: backupPassphraseSchema.nullable().default(null),
})

export const backupDeleteSchema = z.object({ confirmation: backupIdSchema })

export const backupSnapshotResultSchema = z.object({
    bytes: z.number().int().nonnegative(),
    sha256: sha256Schema,
})

const secretKeyVersionsSchema = z.record(z.string().regex(/^[1-9][0-9]*$/), z.string().min(1))

export const backupSecretBundleSchema = z.object({
    deploymentSecretKey: z.string().min(1),
    deploymentSecretKeys: secretKeyVersionsSchema.optional(),
    notificationSecretKey: z.string().min(1),
    notificationSecretKeys: secretKeyVersionsSchema.optional(),
})

export const backupSecretEnvelopeSchema = z.object({
    algorithm: z.literal('aes-256-gcm'),
    authenticationTag: z.string().min(1),
    ciphertext: z.string().min(1),
    initializationVector: z.string().min(1),
    kdf: z.literal('scrypt'),
    kdfBlockSize: z.number().int().positive(),
    kdfCost: z.number().int().positive(),
    kdfParallelization: z.number().int().positive(),
    salt: z.string().min(1),
    version: z.literal(1),
})

export type BackupManifest = z.infer<typeof backupManifestSchema>
export type BackupSecretBundle = z.infer<typeof backupSecretBundleSchema>
export type TrafficBackupParam = z.infer<typeof trafficBackupParamSchema>
