import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
    artifactListSchema,
    artifactSchema,
    uploadChunkResultSchema,
    uploadSessionCreateSchema,
    uploadSessionSchema,
} from '@containers/contracts/upload'
import type { ArtifactInspectionService } from './create-artifact-inspection-service'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../../lib/error'

const MAX_CHUNK_BYTES = 67_108_864
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000

type UploadSessionRow = {
    createdAt: Date
    createdBy: string
    expectedSha256: string
    expectedSizeBytes: number
    expiresAt: Date
    fileName: string
    id: string
    idempotencyKey: string
    mediaType: string
    receivedBytes: number
    status: string
    temporaryPath: string
    updatedAt: Date
}

type ArtifactRow = {
    createdAt: Date
    createdBy: string
    fileName: string
    id: string
    mediaType: string
    sha256: string
    sizeBytes: number
    status: string
    storagePath: string
}

type UploadServiceDb = {
    findOwnedSession: (id: string, createdBy: string) => Promise<UploadSessionRow | undefined>
    findBySessionWithFilters: (id: string, createdBy: string, status: string, expiresBefore: Date) => Promise<UploadSessionRow | undefined>
    findByActorIdempotency: (createdBy: string, idempotencyKey: string) => Promise<UploadSessionRow | undefined>
    countActiveSessions: (createdBy: string, status: string, expiresBefore: Date) => Promise<number>
    findArtifactBySha: (sha256: string) => Promise<ArtifactRow | undefined>
    listStorageSizes: () => Promise<Array<{ sizeBytes: number }>>
    listActiveSessionReservations: (status: string, expiresBefore: Date) => Promise<Array<{ expectedSizeBytes: number; receivedBytes: number }>>
    insertSession: (record: UploadSessionRow) => Promise<void>
    deleteSession: (id: string) => Promise<void>
    appendChunk: (record: {
        createdAt: Date
        id: string
        offsetBytes: number
        sessionId: string
        sha256: string
        sizeBytes: number
        receivedBytes: number
        updatedAt: Date
    }) => Promise<void>
    updateSessionStatus: (id: string, status: string, updatedAt: Date) => Promise<void>
    finalizeArtifact: (artifact: ArtifactRow, sessionId: string) => Promise<void>
    listExpiredSessions: (expiresBefore: Date, statuses: string[]) => Promise<UploadSessionRow[]>
    listAllSessionPaths: () => Promise<Array<{ temporaryPath: string }>>
    listArtifactPaths: () => Promise<Array<{ storagePath: string }>>
    findArtifactByStoragePath: (storagePath: string) => Promise<ArtifactRow | undefined>
    findSessionByTemporaryPath: (temporaryPath: string) => Promise<UploadSessionRow | undefined>
    listArtifacts: () => Promise<ArtifactRow[]>
}

type UploadServiceDependencies = {
    artifactInspectionService: Pick<ArtifactInspectionService, 'inspect'>
    artifactRoot: string
    db: UploadServiceDb
    diskHardAvailableBytes: number
    diskSoftAvailableBytes: number
    engineAgentClient: Pick<EngineAgentClient, 'getOverview'>
    now: () => Date
    totalQuotaBytes: number
}

export type { UploadServiceDb }

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
            db.listStorageSizes(),
            db.listActiveSessionReservations('uploading', now()),
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
        appendChunk: async (
            actorId: string,
            sessionId: string,
            offsetBytes: number,
            chunkSha256: string,
            source: AsyncIterable<Uint8Array> | Uint8Array,
            declaredBytes?: number,
        ) => {
            const session = await db.findBySessionWithFilters(sessionId, actorId, 'uploading', now())

            if (!session) {
                throw createAppError('UPLOAD_SESSION_INVALID')
            }
            if (offsetBytes !== session.receivedBytes) {
                throw createAppError('OFFSET_MISMATCH')
            }

            const remainingBytes = session.expectedSizeBytes - offsetBytes
            const reservedBytes = source instanceof Uint8Array ? source.byteLength : (declaredBytes ?? Math.min(MAX_CHUNK_BYTES, remainingBytes))
            if (reservedBytes === 0 || reservedBytes > MAX_CHUNK_BYTES) {
                throw createAppError('CHUNK_SIZE_INVALID')
            }
            if (reservedBytes > remainingBytes) {
                throw createAppError('UPLOAD_SIZE_EXCEEDED')
            }
            if ((await getAvailableBytes()) - reservedBytes < diskHardAvailableBytes) {
                throw createAppError('DISK_HARD_WATERMARK')
            }

            const hash = createHash('sha256')
            const file = await open(session.temporaryPath, 'r+')
            let writtenBytes = 0
            try {
                for await (const chunk of source instanceof Uint8Array ? [source] : source) {
                    if (writtenBytes + chunk.byteLength > MAX_CHUNK_BYTES) {
                        throw createAppError('CHUNK_SIZE_INVALID')
                    }
                    if (writtenBytes + chunk.byteLength > remainingBytes) {
                        throw createAppError('UPLOAD_SIZE_EXCEEDED')
                    }
                    hash.update(chunk)
                    await file.write(chunk, 0, chunk.byteLength, offsetBytes + writtenBytes)
                    writtenBytes += chunk.byteLength
                }
                if (writtenBytes === 0) {
                    throw createAppError('CHUNK_SIZE_INVALID')
                }
                if (hash.digest('hex') !== chunkSha256) {
                    throw createAppError('CHUNK_DIGEST_MISMATCH')
                }
                await file.sync()
            } finally {
                await file.close()
            }

            const receivedBytes = offsetBytes + writtenBytes
            const createdAt = now()

            await db.appendChunk({
                createdAt,
                id: randomUUID(),
                offsetBytes,
                receivedBytes,
                sessionId,
                sha256: chunkSha256,
                sizeBytes: writtenBytes,
                updatedAt: createdAt,
            })

            return uploadChunkResultSchema.parse({ receivedBytes, sessionId })
        },
        createSession: async (actorId: string, idempotencyKey: string, input: unknown) => {
            const payload = uploadSessionCreateSchema.parse(input)
            const existing = await db.findByActorIdempotency(actorId, idempotencyKey)

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

            const activeCount = await db.countActiveSessions(actorId, 'uploading', now())

            if (activeCount >= 2) {
                throw createAppError('UPLOAD_CONCURRENCY_LIMIT')
            }
            const warnings = await reserveStorage(payload.expectedSizeBytes)

            const id = randomUUID()
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS)
            const quarantineDirectory = join(artifactRoot, 'quarantine')
            await mkdir(quarantineDirectory, { recursive: true })
            const temporaryPath = join(quarantineDirectory, `${id}.part`)

            await db.insertSession({
                createdAt,
                createdBy: actorId,
                expectedSha256: payload.expectedSha256,
                expectedSizeBytes: payload.expectedSizeBytes,
                expiresAt,
                fileName: payload.fileName,
                id,
                idempotencyKey,
                mediaType: payload.mediaType,
                receivedBytes: 0,
                status: 'uploading',
                temporaryPath,
                updatedAt: createdAt,
            })

            try {
                const file = await open(temporaryPath, 'wx', 0o600)
                await file.close()
            } catch (error) {
                await db.deleteSession(id).catch(() => undefined)
                throw error
            }

            return toUploadSession({ expiresAt, id, receivedBytes: 0, status: 'uploading' }, [...warnings])
        },
        finalizeSession: async (actorId: string, sessionId: string) => {
            const session = await db.findOwnedSession(sessionId, actorId)

            if (!session) {
                throw createAppError('UPLOAD_SESSION_INVALID')
            }

            if (session.status !== 'uploading') {
                const existing = await db.findArtifactBySha(session.expectedSha256)
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

            const duplicate = await db.findArtifactBySha(session.expectedSha256)
            if (duplicate) {
                await rm(session.temporaryPath, { force: true }).catch(() => undefined)
                await db.updateSessionStatus(sessionId, 'completed', createdAt)
                return toArtifact(duplicate)
            }

            await mkdir(readyDirectory, { recursive: true })
            const storagePath = join(readyDirectory, `${id}.archive`)

            await db.finalizeArtifact(
                {
                    createdAt,
                    createdBy: actorId,
                    fileName: session.fileName,
                    id,
                    mediaType: session.mediaType,
                    sha256: session.expectedSha256,
                    sizeBytes: session.expectedSizeBytes,
                    status: 'ready',
                    storagePath,
                },
                sessionId,
            )
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
            const session = await db.findOwnedSession(sessionId, actorId)

            return session ? toUploadSession(session) : null
        },
        cleanupExpiredSessions: async () => {
            const expired = await db.listExpiredSessions(now(), ['uploading', 'completed'])
            let removed = 0
            for (const session of expired) {
                await rm(session.temporaryPath, { force: true }).catch(() => undefined)
                await db.deleteSession(session.id)
                removed += 1
            }

            const referencedPaths = new Set((await db.listArtifactPaths()).map((row) => row.storagePath))
            const readyDirectory = join(artifactRoot, 'ready')
            const readyFiles = await readdir(readyDirectory).catch(() => [])
            for (const fileName of readyFiles) {
                const storagePath = join(readyDirectory, fileName)
                if (referencedPaths.has(storagePath)) {
                    continue
                }
                const nowReferenced = await db.findArtifactByStoragePath(storagePath)
                if (nowReferenced) {
                    continue
                }
                await rm(storagePath, { force: true }).catch(() => undefined)
                removed += 1
            }

            const referencedTemporaryPaths = new Set((await db.listAllSessionPaths()).map((row) => row.temporaryPath))
            const quarantineDirectory = join(artifactRoot, 'quarantine')
            const quarantineFiles = await readdir(quarantineDirectory).catch(() => [])
            for (const fileName of quarantineFiles) {
                const temporaryPath = join(quarantineDirectory, fileName)
                if (referencedTemporaryPaths.has(temporaryPath)) {
                    continue
                }
                const nowReferenced = await db.findSessionByTemporaryPath(temporaryPath)
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
                (await db.listArtifacts()).map((record) => ({
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
