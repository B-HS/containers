import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { extract } from 'tar-stream'
import { z } from 'zod'
import { ARTIFACT_MEDIA_TYPE } from '@containers/contracts/upload'
import { createAppError, isAppError } from '../../../lib/error'

const MAX_ARCHIVE_ENTRIES = 100_000
const MAX_METADATA_BYTES = 16_777_216
const MAX_UNCOMPRESSED_BYTES = 42_949_672_960
const MAX_COMPRESSION_RATIO = 20

const dockerManifestSchema = z.array(
    z.object({
        Config: z.string().min(1),
        Layers: z.array(z.string().min(1)).min(1),
        RepoTags: z.array(z.string()).nullable().optional(),
    }),
)

const ociLayoutSchema = z.object({ imageLayoutVersion: z.string().min(1) })
const ociIndexSchema = z.object({
    manifests: z
        .array(
            z.object({
                digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
                mediaType: z.string().min(1),
                size: z.number().int().positive(),
            }),
        )
        .min(1),
    schemaVersion: z.literal(2),
})

const normalizeArchivePath = (value: string) => {
    const normalized = value.startsWith('./') ? value.slice(2) : value
    const segments = normalized.split('/')

    if (normalized.length === 0 || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('\0') || segments.includes('..')) {
        throw createAppError('ARCHIVE_PATH_INVALID')
    }

    return normalized
}

const parseJson = (bytes: Buffer | undefined) => {
    if (!bytes) {
        throw createAppError('ARCHIVE_METADATA_MISSING')
    }

    try {
        return JSON.parse(bytes.toString('utf8')) as unknown
    } catch {
        throw createAppError('ARCHIVE_METADATA_INVALID')
    }
}

const isGzip = async (filePath: string) => {
    const file = await open(filePath, 'r')
    const signature = Buffer.alloc(2)
    await file.read(signature, 0, signature.byteLength, 0)
    await file.close()

    return signature[0] === 0x1f && signature[1] === 0x8b
}

const toInspectionError = (error: unknown, code: string) => (isAppError(error) ? error : createAppError(code, error))

export const createArtifactInspectionService = () => ({
    inspect: async (filePath: string, mediaType: string, uploadedBytes: number) => {
        const archiveEntries = new Set<string>()
        const blobHashes = new Map<string, string>()
        const metadata = new Map<string, Buffer>()
        const archive = extract()
        let entryCount = 0
        let uncompressedBytes = 0

        archive.on('entry', (header, stream, next) => {
            const handleEntry = async () => {
                const name = normalizeArchivePath(header.name)
                const entrySize = header.size ?? 0
                entryCount += 1
                uncompressedBytes += entrySize

                if (entryCount > MAX_ARCHIVE_ENTRIES) {
                    throw createAppError('ARCHIVE_ENTRY_LIMIT')
                }
                if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES || uncompressedBytes > uploadedBytes * MAX_COMPRESSION_RATIO) {
                    throw createAppError('ARCHIVE_EXPANSION_LIMIT')
                }
                if (header.type !== 'file' && header.type !== 'directory') {
                    throw createAppError('ARCHIVE_ENTRY_TYPE_INVALID')
                }

                archiveEntries.add(name)
                const shouldCollectMetadata = name === 'manifest.json' || name === 'index.json' || name === 'oci-layout'
                const shouldHashBlob = /^blobs\/sha256\/[a-f0-9]{64}$/.test(name)
                const chunks: Buffer[] = []
                const hash = shouldHashBlob ? createHash('sha256') : undefined
                let collectedBytes = 0

                for await (const rawChunk of stream) {
                    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
                    hash?.update(chunk)
                    if (shouldCollectMetadata) {
                        collectedBytes += chunk.byteLength
                        if (collectedBytes > MAX_METADATA_BYTES) {
                            throw createAppError('ARCHIVE_METADATA_LIMIT')
                        }
                        chunks.push(chunk)
                    }
                }

                if (shouldCollectMetadata) {
                    metadata.set(name, Buffer.concat(chunks))
                }
                if (hash) {
                    blobHashes.set(name, hash.digest('hex'))
                }
            }

            handleEntry()
                .then(next)
                .catch((error: unknown) => archive.destroy(error instanceof Error ? error : createAppError('ARCHIVE_INVALID')))
        })

        try {
            if (await isGzip(filePath)) {
                await pipeline(createReadStream(filePath), createGunzip(), archive)
            } else {
                await pipeline(createReadStream(filePath), archive)
            }
        } catch (error) {
            throw toInspectionError(error, 'ARCHIVE_INVALID')
        }

        try {
            if (mediaType === ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE) {
                const manifest = dockerManifestSchema.parse(parseJson(metadata.get('manifest.json')))
                for (const image of manifest) {
                    if (!archiveEntries.has(normalizeArchivePath(image.Config))) {
                        throw createAppError('DOCKER_CONFIG_MISSING')
                    }
                    for (const layer of image.Layers) {
                        if (!archiveEntries.has(normalizeArchivePath(layer))) {
                            throw createAppError('DOCKER_LAYER_MISSING')
                        }
                    }
                }
            } else if (mediaType === ARTIFACT_MEDIA_TYPE.OCI_IMAGE_ARCHIVE) {
                ociLayoutSchema.parse(parseJson(metadata.get('oci-layout')))
                const index = ociIndexSchema.parse(parseJson(metadata.get('index.json')))
                for (const descriptor of index.manifests) {
                    const expectedDigest = descriptor.digest.slice('sha256:'.length)
                    const blobPath = `blobs/sha256/${expectedDigest}`
                    if (!archiveEntries.has(blobPath) || blobHashes.get(blobPath) !== expectedDigest) {
                        throw createAppError('OCI_BLOB_DIGEST_INVALID')
                    }
                }
            } else {
                throw createAppError('ARTIFACT_MEDIA_TYPE_INVALID')
            }
        } catch (error) {
            throw toInspectionError(error, 'ARCHIVE_METADATA_INVALID')
        }

        return { entryCount, uncompressedBytes }
    },
})

export type ArtifactInspectionService = ReturnType<typeof createArtifactInspectionService>
