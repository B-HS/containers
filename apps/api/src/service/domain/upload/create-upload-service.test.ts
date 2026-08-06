import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { ARTIFACT_MEDIA_TYPE } from '@containers/contracts/upload'
import { createControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment, uploadSession, user } from '@containers/db-schema/schema'
import { buildUploadServiceDb } from '../../../compose/compose-upload'
import { createAppError } from '../../../lib/error'
import { toStreamChunks } from '../../../lib/stream-chunks'
import { createUploadService } from './create-upload-service'

const RETENTION_DAYS = 30
const RETENTION_MINIMUM_COUNT = 2
const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestService = async ({
    initialAvailableBytes = 1_000_000,
    inspectionFailure,
    totalQuotaBytes = 10_000_000,
}: { initialAvailableBytes?: number; inspectionFailure?: string; totalQuotaBytes?: number } = {}) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-upload-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const createdAt = new Date('2026-07-31T00:00:00.000Z')
    const actorId = 'test-operator'
    await database.db.insert(user).values({
        createdAt,
        email: 'operator@example.com',
        emailVerified: true,
        id: actorId,
        name: 'Operator',
        updatedAt: createdAt,
    })
    let availableBytes = initialAvailableBytes
    const service = createUploadService({
        artifactInspectionService: {
            inspect: async () => {
                if (inspectionFailure !== undefined) {
                    throw createAppError(inspectionFailure)
                }
                return { entryCount: 3, uncompressedBytes: 20 }
            },
        },
        artifactRetentionDays: RETENTION_DAYS,
        artifactRetentionMinimumCount: RETENTION_MINIMUM_COUNT,
        artifactRoot: join(directory, 'artifacts'),
        db: buildUploadServiceDb(database.db),
        diskHardAvailableBytes: 10,
        diskSoftAvailableBytes: 20,
        engineAgentClient: {
            getOverview: async () => ({
                architecture: 'arm64',
                apiVersion: '1.52',
                containers: { paused: 0, running: 0, stopped: 0, total: 0 },
                cpus: 10,
                disk: {
                    availableBytes,
                    buildCacheBytes: 0,
                    capacityBytes: 2_000_000,
                    containerWritableBytes: 0,
                    estimatedReclaimableBytes: 0,
                    layersBytes: 0,
                    localVolumeBytes: 0,
                    usedBytes: 1_000_000,
                },
                engineId: 'engine-id',
                engineName: 'docker-desktop',
                images: 0,
                memoryBytes: 1_024,
                minApiVersion: '1.44',
                operatingSystem: 'Docker Desktop',
                os: 'linux',
                version: '29.6.2',
            }),
        },
        now: () => createdAt,
        totalQuotaBytes,
    })

    return { ...database, actorId, directory, service, setAvailableBytes: (value: number) => (availableBytes = value) }
}

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('업로드 서비스', () => {
    test('chunk를 순서대로 저장하고 전체 digest를 검증한 뒤 ready artifact로 이동합니다', async () => {
        const { actorId, db, directory, service, sqlite } = await createTestService()
        const firstChunk = new TextEncoder().encode('docker-image-')
        const secondChunk = new TextEncoder().encode('archive')
        const bytes = new Uint8Array([...firstChunk, ...secondChunk])
        const session = await service.createSession(actorId, 'upload-test-0001', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })

        expect(await service.appendChunk(actorId, session.id, 0, digest(firstChunk), firstChunk)).toEqual({
            receivedBytes: firstChunk.byteLength,
            sessionId: session.id,
        })
        await service.appendChunk(actorId, session.id, firstChunk.byteLength, digest(secondChunk), secondChunk)
        const result = await service.finalizeSession(actorId, session.id)
        const [record] = await db.select().from(artifact).where(eq(artifact.id, result.id))
        const [upload] = await db.select().from(uploadSession).where(eq(uploadSession.id, session.id))

        expect(result.status).toBe('ready')
        expect(upload?.status).toBe('completed')
        expect(record?.storagePath.startsWith(join(directory, 'artifacts', 'ready'))).toBe(true)
        expect(await readFile(record?.storagePath ?? '', 'utf8')).toBe('docker-image-archive')
        expect((await stat(record?.storagePath ?? '')).mode & 0o777).toBe(0o600)
        sqlite.close()
    })

    test('스트림으로 들어온 chunk 를 이어 써서 같은 artifact 를 만듭니다', async () => {
        const { actorId, db, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('docker-image-archive')
        const session = await service.createSession(actorId, 'upload-stream-0001', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        const stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
                controller.enqueue(bytes.slice(0, 6))
                controller.enqueue(bytes.slice(6))
                controller.close()
            },
        })

        const appended = await service.appendChunk(actorId, session.id, 0, digest(bytes), toStreamChunks(stream), bytes.byteLength)
        const result = await service.finalizeSession(actorId, session.id)
        const [record] = await db.select().from(artifact).where(eq(artifact.id, result.id))

        expect(appended.receivedBytes).toBe(bytes.byteLength)
        expect(result.status).toBe('ready')
        expect(await readFile(record?.storagePath ?? '', 'utf8')).toBe('docker-image-archive')
        sqlite.close()
    })

    test('스트림 chunk 의 digest 가 어긋나면 receivedBytes 를 전진시키지 않습니다', async () => {
        const { actorId, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('docker-image-archive')
        const session = await service.createSession(actorId, 'upload-stream-0002', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        const stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
                controller.enqueue(bytes)
                controller.close()
            },
        })

        await expect(service.appendChunk(actorId, session.id, 0, 'a'.repeat(64), toStreamChunks(stream), bytes.byteLength)).rejects.toThrow(
            'CHUNK_DIGEST_MISMATCH',
        )
        expect((await service.getOwnedSession(actorId, session.id))?.receivedBytes).toBe(0)
        sqlite.close()
    })

    test('완료된 session 을 다시 finalize 하면 같은 sha256 artifact 를 돌려주고 없으면 UPLOAD_SESSION_INVALID 입니다', async () => {
        const { actorId, db, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('docker-image-archive')
        const session = await service.createSession(actorId, 'finalize-idempotent-key', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        await service.appendChunk(actorId, session.id, 0, digest(bytes), bytes)

        const first = await service.finalizeSession(actorId, session.id)
        const repeated = await service.finalizeSession(actorId, session.id)

        expect(repeated).toEqual(first)
        expect(await service.listArtifacts()).toHaveLength(1)

        const orphanBytes = new TextEncoder().encode('another-archive')
        const orphan = await service.createSession(actorId, 'finalize-orphan-key', {
            expectedSha256: digest(orphanBytes),
            expectedSizeBytes: orphanBytes.byteLength,
            fileName: 'other.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        await db.update(uploadSession).set({ status: 'completed' }).where(eq(uploadSession.id, orphan.id))

        await expect(service.finalizeSession(actorId, orphan.id)).rejects.toThrow('UPLOAD_SESSION_INVALID')
        sqlite.close()
    })

    test('offset과 chunk digest 불일치를 거부하고 진행률을 변경하지 않습니다', async () => {
        const { actorId, db, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('archive')
        const session = await service.createSession(actorId, 'upload-test-0002', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })

        await expect(service.appendChunk(actorId, session.id, 1, digest(bytes), bytes)).rejects.toThrow('OFFSET_MISMATCH')
        await expect(service.appendChunk(actorId, session.id, 0, 'a'.repeat(64), bytes)).rejects.toThrow('CHUNK_DIGEST_MISMATCH')
        const [upload] = await db.select().from(uploadSession).where(eq(uploadSession.id, session.id))

        expect(upload?.receivedBytes).toBe(0)
        sqlite.close()
    })

    test('사용자별 활성 업로드를 두 개로 제한합니다', async () => {
        const { actorId, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('archive')
        const input = {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        }

        await service.createSession(actorId, 'upload-test-0003', input)
        await service.createSession(actorId, 'upload-test-0004', input)

        await expect(service.createSession(actorId, 'upload-test-0005', input)).rejects.toThrow('UPLOAD_CONCURRENCY_LIMIT')
        sqlite.close()
    })

    test('검사에 실패한 session 은 활성 슬롯을 붙잡지 않습니다', async () => {
        const { actorId, db, service, sqlite } = await createTestService({ inspectionFailure: 'ARCHIVE_INVALID' })
        const bytes = new TextEncoder().encode('archive')
        const input = {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        }
        const session = await service.createSession(actorId, 'upload-rejected-0001', input)
        await service.appendChunk(actorId, session.id, 0, digest(bytes), bytes)

        await expect(service.finalizeSession(actorId, session.id)).rejects.toThrow('ARCHIVE_INVALID')
        const [record] = await db.select().from(uploadSession).where(eq(uploadSession.id, session.id))

        expect(record?.status).toBe('rejected')
        await service.createSession(actorId, 'upload-rejected-0002', input)
        await service.createSession(actorId, 'upload-rejected-0003', input)
        sqlite.close()
    })

    test('같은 idempotency key는 동일 session을 반환하고 다른 payload를 거부합니다', async () => {
        const { actorId, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('archive')
        const input = {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        }
        const first = await service.createSession(actorId, 'stable-upload-key', input)
        const repeated = await service.createSession(actorId, 'stable-upload-key', input)

        expect(repeated.id).toBe(first.id)
        await expect(service.createSession(actorId, 'stable-upload-key', { ...input, fileName: 'different.tar' })).rejects.toThrow(
            'IDEMPOTENCY_CONFLICT',
        )
        sqlite.close()
    })

    test('예상 잔여 공간이 soft watermark 아래면 경고하고 hard watermark 아래면 차단합니다', async () => {
        const softContext = await createTestService({ initialAvailableBytes: 25 })
        const bytes = new TextEncoder().encode('1234567890')
        const input = {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        }

        const warned = await softContext.service.createSession(softContext.actorId, 'soft-watermark-key', input)
        expect(warned.warnings).toEqual(['DISK_SOFT_WATERMARK'])
        softContext.sqlite.close()

        const hardContext = await createTestService({ initialAvailableBytes: 15 })
        await expect(hardContext.service.createSession(hardContext.actorId, 'hard-watermark-key', input)).rejects.toThrow('DISK_HARD_WATERMARK')
        hardContext.sqlite.close()
    })

    test('artifact와 활성 session 예약 합계가 총 upload quota를 넘으면 차단합니다', async () => {
        const { actorId, service, sqlite } = await createTestService({ totalQuotaBytes: 10 })
        const bytes = new TextEncoder().encode('1234567')
        const input = {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        }

        await service.createSession(actorId, 'quota-session-one', input)
        await expect(service.createSession(actorId, 'quota-session-two', input)).rejects.toThrow('UPLOAD_QUOTA_EXCEEDED')
        sqlite.close()
    })

    test('upload 도중 실제 가용 공간이 hard watermark에 도달하면 다음 chunk를 차단합니다', async () => {
        const { actorId, service, setAvailableBytes, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('archive')
        const session = await service.createSession(actorId, 'runtime-watermark-key', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        setAvailableBytes(bytes.byteLength + 9)

        await expect(service.appendChunk(actorId, session.id, 0, digest(bytes), bytes)).rejects.toThrow('DISK_HARD_WATERMARK')
        sqlite.close()
    })
    test('load 중인 artifact 는 거부하고 load 가 끝난 artifact 는 이력을 남긴 채 삭제합니다', async () => {
        const { actorId, db, directory, service, sqlite } = await createTestService()
        const bytes = new TextEncoder().encode('docker-image-archive')
        const session = await service.createSession(actorId, 'artifact-remove-0001', {
            expectedSha256: digest(bytes),
            expectedSizeBytes: bytes.byteLength,
            fileName: 'image.tar',
            mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
        })
        await service.appendChunk(actorId, session.id, 0, digest(bytes), bytes)
        const created = await service.finalizeSession(actorId, session.id)
        const [record] = await db.select().from(artifact).where(eq(artifact.id, created.id))

        await db.insert(deployment).values({
            artifactId: created.id,
            createdAt: new Date('2026-07-31T00:00:00.000Z'),
            createdBy: actorId,
            id: 'deployment-holding-artifact',
            status: 'loading',
            updatedAt: new Date('2026-07-31T00:00:00.000Z'),
        })
        await expect(service.removeArtifact(created.id, { confirmation: created.id })).rejects.toThrow('ARTIFACT_IN_USE')

        await db.update(deployment).set({ status: 'loaded' }).where(eq(deployment.id, 'deployment-holding-artifact'))
        await expect(service.removeArtifact(created.id, { confirmation: session.id })).rejects.toThrow('CONFIRMATION_MISMATCH')
        expect((await service.removeArtifact(created.id, { confirmation: created.id })).id).toBe(created.id)
        expect(await Bun.file(record?.storagePath ?? join(directory, 'missing')).exists()).toBe(false)
        expect(await service.listArtifacts()).toEqual([])
        const [history] = await db.select().from(deployment).where(eq(deployment.id, 'deployment-holding-artifact'))
        expect(history?.artifactId).toBeNull()
        sqlite.close()
    })
    test('보존 기간이 지나고 참조되지 않는 artifact 만 정리하되 최소 보관 수는 남깁니다', async () => {
        const { actorId, db, service, sqlite } = await createTestService()
        const timestamps = ['2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z', '2026-05-03T00:00:00.000Z', '2026-07-30T00:00:00.000Z']
        for (const [index, createdAt] of timestamps.entries()) {
            await db.insert(artifact).values({
                createdAt: new Date(createdAt),
                createdBy: actorId,
                fileName: `old-${index}.tar`,
                id: `00000000-0000-4000-8000-00000000000${index}`,
                mediaType: ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE,
                sha256: createHash('sha256').update(`old-${index}`).digest('hex'),
                sizeBytes: 100,
                status: 'ready',
                storagePath: join('/nonexistent', `old-${index}.tar`),
            })
        }

        const result = await service.cleanupExpiredArtifacts()

        expect(result).toEqual({ removedArtifactCount: 2, removedByteSize: 200 })
        expect((await service.listArtifacts()).map((record) => record.fileName).sort()).toEqual(['old-2.tar', 'old-3.tar'])
        sqlite.close()
    })
})
