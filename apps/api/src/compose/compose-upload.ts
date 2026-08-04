import { and, count, eq, gt, lt, inArray } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment, uploadChunk, uploadSession } from '@containers/db-schema/schema'
import type { ArtifactInspectionService } from '../service/domain/upload/create-artifact-inspection-service'
import type { EngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createUploadService, type UploadServiceDb } from '../service/domain/upload/create-upload-service'

type ComposeUploadDependencies = {
    db: ControlDatabase
    artifactInspectionService: Pick<ArtifactInspectionService, 'inspect'>
    artifactRetentionDays: number
    artifactRetentionMinimumCount: number
    artifactRoot: string
    diskHardAvailableBytes: number
    diskSoftAvailableBytes: number
    engineAgentClient: Pick<EngineAgentClient, 'getOverview'>
    totalQuotaBytes: number
}

export const buildUploadServiceDb = (db: ControlDatabase): UploadServiceDb => ({
    findOwnedSession: async (id, createdBy) => {
        const [record] = await db
            .select()
            .from(uploadSession)
            .where(and(eq(uploadSession.id, id), eq(uploadSession.createdBy, createdBy)))
            .limit(1)
        return record
    },
    findBySessionWithFilters: async (id, createdBy, status, expiresBefore) => {
        const [record] = await db
            .select()
            .from(uploadSession)
            .where(
                and(
                    eq(uploadSession.id, id),
                    eq(uploadSession.createdBy, createdBy),
                    eq(uploadSession.status, status),
                    gt(uploadSession.expiresAt, expiresBefore),
                ),
            )
            .limit(1)
        return record
    },
    findByActorIdempotency: async (createdBy, idempotencyKey) => {
        const [record] = await db
            .select()
            .from(uploadSession)
            .where(and(eq(uploadSession.createdBy, createdBy), eq(uploadSession.idempotencyKey, idempotencyKey)))
            .limit(1)
        return record
    },
    countActiveSessions: async (createdBy, status, expiresBefore) => {
        const [record] = await db
            .select({ value: count() })
            .from(uploadSession)
            .where(and(eq(uploadSession.createdBy, createdBy), eq(uploadSession.status, status), gt(uploadSession.expiresAt, expiresBefore)))
        return record?.value ?? 0
    },
    findArtifactBySha: async (sha256) => {
        const [record] = await db.select().from(artifact).where(eq(artifact.sha256, sha256)).limit(1)
        return record
    },
    listStorageSizes: async () => db.select({ sizeBytes: artifact.sizeBytes }).from(artifact),
    listActiveSessionReservations: async (status, expiresBefore) =>
        db
            .select({ expectedSizeBytes: uploadSession.expectedSizeBytes, receivedBytes: uploadSession.receivedBytes })
            .from(uploadSession)
            .where(and(eq(uploadSession.status, status), gt(uploadSession.expiresAt, expiresBefore))),
    insertSession: async (record) => {
        await db.insert(uploadSession).values(record)
    },
    deleteSession: async (id) => {
        await db.delete(uploadSession).where(eq(uploadSession.id, id))
    },
    appendChunk: async (record) => {
        await db.transaction(async (transaction) => {
            await transaction.insert(uploadChunk).values({
                createdAt: record.createdAt,
                id: record.id,
                offsetBytes: record.offsetBytes,
                sessionId: record.sessionId,
                sha256: record.sha256,
                sizeBytes: record.sizeBytes,
            })
            await transaction
                .update(uploadSession)
                .set({ receivedBytes: record.receivedBytes, updatedAt: record.updatedAt })
                .where(eq(uploadSession.id, record.sessionId))
        })
    },
    finalizeArtifact: async (artifactRecord, sessionId) => {
        await db.transaction(async (transaction) => {
            await transaction.insert(artifact).values(artifactRecord)
            await transaction
                .update(uploadSession)
                .set({ status: 'completed', updatedAt: artifactRecord.createdAt })
                .where(eq(uploadSession.id, sessionId))
        })
    },
    updateSessionStatus: async (id, status, updatedAt) => {
        await db.update(uploadSession).set({ status, updatedAt }).where(eq(uploadSession.id, id))
    },
    listExpiredSessions: async (expiresBefore, statuses) =>
        db
            .select()
            .from(uploadSession)
            .where(and(lt(uploadSession.expiresAt, expiresBefore), inArray(uploadSession.status, statuses))),
    listAllSessionPaths: async () => db.select({ temporaryPath: uploadSession.temporaryPath }).from(uploadSession),
    listArtifactPaths: async () => db.select({ storagePath: artifact.storagePath }).from(artifact),
    findArtifactByStoragePath: async (storagePath) => {
        const [record] = await db.select().from(artifact).where(eq(artifact.storagePath, storagePath)).limit(1)
        return record
    },
    findSessionByTemporaryPath: async (temporaryPath) => {
        const [record] = await db.select().from(uploadSession).where(eq(uploadSession.temporaryPath, temporaryPath)).limit(1)
        return record
    },
    listArtifacts: async () => db.select().from(artifact).orderBy(artifact.createdAt),
    findArtifactById: async (id) => {
        const [record] = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1)
        return record
    },
    countDeploymentsByArtifact: async (artifactId) => {
        const [row] = await db.select({ value: count() }).from(deployment).where(eq(deployment.artifactId, artifactId))
        return row?.value ?? 0
    },
    deleteArtifact: async (id) => {
        await db.delete(artifact).where(eq(artifact.id, id))
    },
})

export const composeUpload = ({
    db,
    artifactInspectionService,
    artifactRetentionDays,
    artifactRetentionMinimumCount,
    artifactRoot,
    diskHardAvailableBytes,
    diskSoftAvailableBytes,
    engineAgentClient,
    totalQuotaBytes,
}: ComposeUploadDependencies) => ({
    uploadService: createUploadService({
        artifactInspectionService,
        artifactRetentionDays,
        artifactRetentionMinimumCount,
        artifactRoot,
        db: buildUploadServiceDb(db),
        diskHardAvailableBytes,
        diskSoftAvailableBytes,
        engineAgentClient,
        now: () => new Date(),
        totalQuotaBytes,
    }),
})
