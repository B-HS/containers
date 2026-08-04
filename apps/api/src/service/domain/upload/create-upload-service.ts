import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { and, count, eq, gt, lt, ne } from 'drizzle-orm'
import {
    artifactListSchema,
    artifactSchema,
    uploadChunkResultSchema,
    uploadSessionCreateSchema,
    uploadSessionSchema,
} from '@containers/contracts/upload'
import type { ControlDatabase } from '@containers/db-schema/database'
import { artifact, uploadChunk, uploadSession } from '@containers/db-schema/schema'
import type { ArtifactInspectionService } from './create-artifact-inspection-service'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import { createAppError } from '../../../lib/error'

const MAX_CHUNK_BYTES = 67_108_864
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000

type UploadServiceDependencies = {
    artifactInspectionService: Pick<ArtifactInspectionService, 'inspect'>
    artifactRoot: string
    db: ControlDatabase
    diskHardAvailableBytes: number
    diskSoftAvailableBytes: number
    engineAgentClient: Pick<EngineAgentClient, 'getOverview'>
    now: () => Date
    totalQuotaBytes: number
}

const hashFile = (filePath: string) =>
    new Promise<string>((resolve, reject) => {
        const hash = createHash('sha256')
        const stream = createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(hash.digest('hex')))
    })

const toUploadSession = (
    record: { expiresAt: Date; id: string; receivedBytes: number; status: string },
    warnings: Array<'DISK_SOFT_WATERMARK'> = [],
) =>
    uploadSessionSchema.parse({
        expiresAt: record.expiresAt.toISOString(),
        id: record.id,
        maxChunkBytes: MAX_CHUNK_BYTES,
        receivedBytes: record.receivedBytes,
        status: record.status,
        warnings,
    })

const toArtifact = (record: { createdAt: Date; fileName: string; id: string; mediaType: string; sha256: string; sizeBytes: number }) =>
    artifactSchema.parse({
        createdAt: record.createdAt.toISOString(),
        fileName: record.fileName,
        id: record.id,
        mediaType: record.mediaType,
        sha256: record.sha256,
        sizeBytes: record.sizeBytes,
        status: 'ready',
    })

export const createUploadService = ({
    artifactInspectionService,
    artifactRoot,
    db,
    diskHardAvailableBytes,
    diskSoftAvailableBytes,
    engineAgentClient,
    now,
    totalQuotaBytes,
}: UploadServiceDependencies) => {
    const getAvailableBytes = async () => {
        try {
            return (await engineAgentClient.getOverview()).disk.availableBytes
        } catch {
            throw createAppError('DISK_STATUS_UNAVAILABLE')
        }
    }
    const reserveStorage = async (additionalBytes: number) => {
        const [artifacts, activeSessions, availableBytes] = await Promise.all([
            db.select({ sizeBytes: artifact.sizeBytes }).from(artifact),
            db
                .select({ expectedSizeBytes: uploadSession.expectedSizeBytes, receivedBytes: uploadSession.receivedBytes })
                .from(uploadSession)
                .where(and(eq(uploadSession.status, 'uploading'), gt(uploadSession.expiresAt, now()))),
            getAvailableBytes(),
        ])
        const storedBytes = artifacts.reduce((total, item) => total + item.sizeBytes, 0)
        const reservedBytes = activeSessions.reduce((total, session) => total + session.expectedSizeBytes, 0)
        const remainingReservedBytes = activeSessions.reduce(
            (total, session) => total + Math.max(0, session.expectedSizeBytes - session.receivedBytes),
            0,
        )
        if (storedBytes + reservedBytes + additionalBytes > totalQuotaBytes) {
            throw createAppError('UPLOAD_QUOTA_EXCEEDED')
        }
        const projectedAvailableBytes = availableBytes - remainingReservedBytes - additionalBytes
        if (projectedAvailableBytes < diskHardAvailableBytes) {
            throw createAppError('DISK_HARD_WATERMARK')
        }
        return projectedAvailableBytes < diskSoftAvailableBytes ? (['DISK_SOFT_WATERMARK'] as const) : []
    }

    return {
        appendChunk: async (actorId: string, sessionId: string, offsetBytes: number, chunkSha256: string, bytes: Uint8Array) => {
            const [session] = await db
                .select()
                .from(uploadSession)
                .where(
                    and(
                        eq(uploadSession.id, sessionId),
                        eq(uploadSession.createdBy, actorId),
                        eq(uploadSession.status, 'uploading'),
                        gt(uploadSession.expiresAt, now()),
                    ),
                )
                .limit(1)

            if (!session) {
                throw createAppError('UPLOAD_SESSION_INVALID')
            }
            if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) {
                throw createAppError('CHUNK_SIZE_INVALID')
            }
            if (offsetBytes !== session.receivedBytes) {
                throw createAppError('OFFSET_MISMATCH')
            }
            if (offsetBytes + bytes.byteLength > session.expectedSizeBytes) {
                throw createAppError('UPLOAD_SIZE_EXCEEDED')
            }
            if (createHash('sha256').update(bytes).digest('hex') !== chunkSha256) {
                throw createAppError('CHUNK_DIGEST_MISMATCH')
            }
            if ((await getAvailableBytes()) - bytes.byteLength < diskHardAvailableBytes) {
                throw createAppError('DISK_HARD_WATERMARK')
            }

            const file = await open(session.temporaryPath, 'r+')
            await file.write(bytes, 0, bytes.byteLength, offsetBytes)
            await file.sync()
            await file.close()
            const receivedBytes = offsetBytes + bytes.byteLength
            const createdAt = now()

            await db.transaction(async (transaction) => {
                await transaction.insert(uploadChunk).values({
                    createdAt,
                    id: randomUUID(),
                    offsetBytes,
                    sessionId,
                    sha256: chunkSha256,
                    sizeBytes: bytes.byteLength,
                })
                await transaction.update(uploadSession).set({ receivedBytes, updatedAt: createdAt }).where(eq(uploadSession.id, sessionId))
            })

            return uploadChunkResultSchema.parse({ receivedBytes, sessionId })
        },
        createSession: async (actorId: string, idempotencyKey: string, input: unknown) => {
            const payload = uploadSessionCreateSchema.parse(input)
            const [existing] = await db
                .select()
                .from(uploadSession)
                .where(and(eq(uploadSession.createdBy, actorId), eq(uploadSession.idempotencyKey, idempotencyKey)))
                .limit(1)

            if (existing) {
                if (
                    existing.expectedSha256 !== payload.expectedSha256 ||
                    existing.expectedSizeBytes !== payload.expectedSizeBytes ||
                    existing.fileName !== payload.fileName ||
                    existing.mediaType !== payload.mediaType
                ) {
                    throw createAppError('IDEMPOTENCY_CONFLICT')
                }

                return toUploadSession(existing)
            }

            const [active] = await db
                .select({ value: count() })
                .from(uploadSession)
                .where(and(eq(uploadSession.createdBy, actorId), eq(uploadSession.status, 'uploading'), gt(uploadSession.expiresAt, now())))

            if ((active?.value ?? 0) >= 2) {
                throw createAppError('UPLOAD_CONCURRENCY_LIMIT')
            }
            const warnings = await reserveStorage(payload.expectedSizeBytes)

            const id = randomUUID()
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS)
            const quarantineDirectory = join(artifactRoot, 'quarantine')
            await mkdir(quarantineDirectory, { recursive: true })
            const temporaryPath = join(quarantineDirectory, `${id}.part`)

            await db.insert(uploadSession).values({
                createdAt,
                createdBy: actorId,
                expectedSha256: payload.expectedSha256,
                expectedSizeBytes: payload.expectedSizeBytes,
                expiresAt,
                fileName: payload.fileName,
                id,
                idempotencyKey,
                mediaType: payload.mediaType,
                status: 'uploading',
                temporaryPath,
                updatedAt: createdAt,
            })

            try {
                const file = await open(temporaryPath, 'wx', 0o600)
                await file.close()
            } catch (error) {
                await db
                    .delete(uploadSession)
                    .where(eq(uploadSession.id, id))
                    .catch(() => undefined)
                throw error
            }

            return toUploadSession({ expiresAt, id, receivedBytes: 0, status: 'uploading' }, [...warnings])
        },
        finalizeSession: async (actorId: string, sessionId: string) => {
            const [session] = await db
                .select()
                .from(uploadSession)
                .where(and(eq(uploadSession.id, sessionId), eq(uploadSession.createdBy, actorId)))
                .limit(1)

            if (!session) {
                throw createAppError('UPLOAD_SESSION_INVALID')
            }

            if (session.status !== 'uploading') {
                const [existing] = await db.select().from(artifact).where(eq(artifact.sha256, session.expectedSha256)).limit(1)
                if (!existing) {
                    throw createAppError('UPLOAD_SESSION_INVALID')
                }
                return toArtifact(existing)
            }
            if (session.receivedBytes !== session.expectedSizeBytes) {
                throw createAppError('UPLOAD_INCOMPLETE')
            }
            if ((await hashFile(session.temporaryPath)) !== session.expectedSha256) {
                throw createAppError('ARTIFACT_DIGEST_MISMATCH')
            }
            await artifactInspectionService.inspect(session.temporaryPath, session.mediaType, session.expectedSizeBytes)

            const createdAt = now()
            const id = randomUUID()
            const readyDirectory = join(artifactRoot, 'ready')

            const [duplicate] = await db.select().from(artifact).where(eq(artifact.sha256, session.expectedSha256)).limit(1)
            if (duplicate) {
                await rm(session.temporaryPath, { force: true }).catch(() => undefined)
                await db.update(uploadSession).set({ status: 'completed', updatedAt: createdAt }).where(eq(uploadSession.id, sessionId))
                return toArtifact(duplicate)
            }

            await mkdir(readyDirectory, { recursive: true })
            const storagePath = join(readyDirectory, `${id}.archive`)

            await db.transaction(async (transaction) => {
                await transaction.insert(artifact).values({
                    createdAt,
                    createdBy: actorId,
                    fileName: session.fileName,
                    id,
                    mediaType: session.mediaType,
                    sha256: session.expectedSha256,
                    sizeBytes: session.expectedSizeBytes,
                    status: 'ready',
                    storagePath,
                })
                await transaction.update(uploadSession).set({ status: 'completed', updatedAt: createdAt }).where(eq(uploadSession.id, sessionId))
            })
            await rename(session.temporaryPath, storagePath)

            return toArtifact({
                createdAt,
                fileName: session.fileName,
                id,
                mediaType: session.mediaType,
                sha256: session.expectedSha256,
                sizeBytes: session.expectedSizeBytes,
            })
        },
        getOwnedSession: async (actorId: string, sessionId: string) => {
            const [session] = await db
                .select()
                .from(uploadSession)
                .where(and(eq(uploadSession.id, sessionId), eq(uploadSession.createdBy, actorId)))
                .limit(1)

            return session ? toUploadSession(session) : null
        },
        cleanupExpiredSessions: async () => {
            const expired = await db
                .select()
                .from(uploadSession)
                .where(and(lt(uploadSession.expiresAt, now()), ne(uploadSession.status, 'completed')))
            const completedWithStaleFiles = await db
                .select()
                .from(uploadSession)
                .where(and(eq(uploadSession.status, 'completed'), lt(uploadSession.expiresAt, now())))
            let removed = 0
            for (const session of [...expired, ...completedWithStaleFiles]) {
                await rm(session.temporaryPath, { force: true }).catch(() => undefined)
                await db.delete(uploadSession).where(eq(uploadSession.id, session.id))
                removed += 1
            }

            const referencedPaths = new Set((await db.select({ storagePath: artifact.storagePath }).from(artifact)).map((row) => row.storagePath))
            const readyDirectory = join(artifactRoot, 'ready')
            const readyFiles = await readdir(readyDirectory).catch(() => [])
            for (const fileName of readyFiles) {
                const storagePath = join(readyDirectory, fileName)
                if (referencedPaths.has(storagePath)) {
                    continue
                }
                const [nowReferenced] = await db
                    .select({ storagePath: artifact.storagePath })
                    .from(artifact)
                    .where(eq(artifact.storagePath, storagePath))
                    .limit(1)
                if (nowReferenced) {
                    continue
                }
                await rm(storagePath, { force: true }).catch(() => undefined)
                removed += 1
            }

            const referencedTemporaryPaths = new Set(
                (await db.select({ temporaryPath: uploadSession.temporaryPath }).from(uploadSession)).map((row) => row.temporaryPath),
            )
            const quarantineDirectory = join(artifactRoot, 'quarantine')
            const quarantineFiles = await readdir(quarantineDirectory).catch(() => [])
            for (const fileName of quarantineFiles) {
                const temporaryPath = join(quarantineDirectory, fileName)
                if (referencedTemporaryPaths.has(temporaryPath)) {
                    continue
                }
                const [nowReferenced] = await db
                    .select({ temporaryPath: uploadSession.temporaryPath })
                    .from(uploadSession)
                    .where(eq(uploadSession.temporaryPath, temporaryPath))
                    .limit(1)
                if (nowReferenced) {
                    continue
                }
                await rm(temporaryPath, { force: true }).catch(() => undefined)
                removed += 1
            }
            return removed
        },
        listArtifacts: async () =>
            artifactListSchema.parse(
                (await db.select().from(artifact).orderBy(artifact.createdAt)).map((record) => ({
                    createdAt: record.createdAt.toISOString(),
                    fileName: record.fileName,
                    id: record.id,
                    mediaType: record.mediaType,
                    sha256: record.sha256,
                    sizeBytes: record.sizeBytes,
                    status: record.status,
                })),
            ),
    }
}

export type UploadService = ReturnType<typeof createUploadService>
