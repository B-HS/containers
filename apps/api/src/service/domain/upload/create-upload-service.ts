import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { and, count, eq, gt } from 'drizzle-orm'
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
            throw new Error('DISK_STATUS_UNAVAILABLE')
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
            throw new Error('UPLOAD_QUOTA_EXCEEDED')
        }
        const projectedAvailableBytes = availableBytes - remainingReservedBytes - additionalBytes
        if (projectedAvailableBytes < diskHardAvailableBytes) {
            throw new Error('DISK_HARD_WATERMARK')
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
                throw new Error('UPLOAD_SESSION_INVALID')
            }
            if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) {
                throw new Error('CHUNK_SIZE_INVALID')
            }
            if (offsetBytes !== session.receivedBytes) {
                throw new Error('OFFSET_MISMATCH')
            }
            if (offsetBytes + bytes.byteLength > session.expectedSizeBytes) {
                throw new Error('UPLOAD_SIZE_EXCEEDED')
            }
            if (createHash('sha256').update(bytes).digest('hex') !== chunkSha256) {
                throw new Error('CHUNK_DIGEST_MISMATCH')
            }
            if ((await getAvailableBytes()) - bytes.byteLength < diskHardAvailableBytes) {
                throw new Error('DISK_HARD_WATERMARK')
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
                    throw new Error('IDEMPOTENCY_CONFLICT')
                }

                return toUploadSession(existing)
            }

            const [active] = await db
                .select({ value: count() })
                .from(uploadSession)
                .where(and(eq(uploadSession.createdBy, actorId), eq(uploadSession.status, 'uploading'), gt(uploadSession.expiresAt, now())))

            if ((active?.value ?? 0) >= 2) {
                throw new Error('UPLOAD_CONCURRENCY_LIMIT')
            }
            const warnings = await reserveStorage(payload.expectedSizeBytes)

            const id = randomUUID()
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS)
            const quarantineDirectory = join(artifactRoot, 'quarantine')
            await mkdir(quarantineDirectory, { recursive: true })
            const temporaryPath = join(quarantineDirectory, `${id}.part`)
            const file = await open(temporaryPath, 'wx', 0o600)
            await file.close()

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

            return toUploadSession({ expiresAt, id, receivedBytes: 0, status: 'uploading' }, [...warnings])
        },
        finalizeSession: async (actorId: string, sessionId: string) => {
            const [session] = await db
                .select()
                .from(uploadSession)
                .where(and(eq(uploadSession.id, sessionId), eq(uploadSession.createdBy, actorId), eq(uploadSession.status, 'uploading')))
                .limit(1)

            if (!session) {
                throw new Error('UPLOAD_SESSION_INVALID')
            }
            if (session.receivedBytes !== session.expectedSizeBytes) {
                throw new Error('UPLOAD_INCOMPLETE')
            }
            if ((await hashFile(session.temporaryPath)) !== session.expectedSha256) {
                throw new Error('ARTIFACT_DIGEST_MISMATCH')
            }
            await artifactInspectionService.inspect(session.temporaryPath, session.mediaType, session.expectedSizeBytes)

            const id = randomUUID()
            const readyDirectory = join(artifactRoot, 'ready')
            await mkdir(readyDirectory, { recursive: true })
            const storagePath = join(readyDirectory, `${id}.archive`)
            await rename(session.temporaryPath, storagePath)
            const createdAt = now()

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

            return artifactSchema.parse({
                createdAt: createdAt.toISOString(),
                fileName: session.fileName,
                id,
                mediaType: session.mediaType,
                sha256: session.expectedSha256,
                sizeBytes: session.expectedSizeBytes,
                status: 'ready',
            })
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
