import { z } from 'zod'

export const backupIdSchema = z.uuid()

export const backupCreateSchema = z.object({
    label: z.string().trim().min(1).max(100).nullable().default(null),
})

export const backupManifestSchema = z.object({
    controlBytes: z.number().int().nonnegative(),
    controlSha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime(),
    id: backupIdSchema,
    label: z.string().nullable(),
    schemaVersion: z.literal(1),
    trafficBytes: z.number().int().nonnegative(),
    trafficSha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const backupListSchema = z.array(backupManifestSchema)
export const backupRestoreSchema = z.object({ confirmation: backupIdSchema })
export const backupDeleteSchema = z.object({ confirmation: backupIdSchema })

export const backupSnapshotResultSchema = z.object({
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export type BackupManifest = z.infer<typeof backupManifestSchema>
