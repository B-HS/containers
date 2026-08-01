import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { pack } from 'tar-stream'
import { ARTIFACT_MEDIA_TYPE } from '@containers/contracts/upload'
import { createArtifactInspectionService } from './create-artifact-inspection-service'

type ArchiveEntry = {
    body?: Buffer
    name: string
    type?: 'file' | 'symlink'
}

const readStream = (stream: Readable) =>
    new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks)))
    })

const createArchive = async (entries: ArchiveEntry[]) => {
    const archive = pack()
    const result = readStream(archive)

    for (const entry of entries) {
        archive.entry({ linkname: entry.type === 'symlink' ? 'target' : undefined, name: entry.name, type: entry.type ?? 'file' }, entry.body)
    }
    archive.finalize()

    return result
}

const withArchive = async (bytes: Buffer, operation: (filePath: string) => Promise<void>) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-inspection-'))
    const filePath = join(directory, 'artifact.tar')
    await writeFile(filePath, bytes)
    try {
        await operation(filePath)
    } finally {
        await rm(directory, { force: true, recursive: true })
    }
}

describe('Artifact archive 검사', () => {
    test('Docker save archive의 manifest 참조와 gzip 전송을 검증합니다', async () => {
        const archive = await createArchive([
            { body: Buffer.from('{"architecture":"arm64","os":"linux"}'), name: 'config.json' },
            { body: Buffer.alloc(1_024), name: 'layer.tar' },
            {
                body: Buffer.from(JSON.stringify([{ Config: 'config.json', Layers: ['layer.tar'], RepoTags: ['example:latest'] }])),
                name: 'manifest.json',
            },
        ])
        const compressed = gzipSync(archive)

        await withArchive(compressed, async (filePath) => {
            const result = await createArtifactInspectionService().inspect(filePath, ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE, compressed.byteLength)
            expect(result.entryCount).toBe(3)
        })
    })

    test('OCI index가 참조하는 blob의 실제 digest를 검증합니다', async () => {
        const blob = Buffer.from('{"schemaVersion":2}')
        const digest = createHash('sha256').update(blob).digest('hex')
        const archive = await createArchive([
            { body: Buffer.from('{"imageLayoutVersion":"1.0.0"}'), name: 'oci-layout' },
            {
                body: Buffer.from(
                    JSON.stringify({
                        manifests: [{ digest: `sha256:${digest}`, mediaType: 'application/vnd.oci.image.manifest.v1+json', size: blob.byteLength }],
                        schemaVersion: 2,
                    }),
                ),
                name: 'index.json',
            },
            { body: blob, name: `blobs/sha256/${digest}` },
        ])

        await withArchive(archive, async (filePath) => {
            const result = await createArtifactInspectionService().inspect(filePath, ARTIFACT_MEDIA_TYPE.OCI_IMAGE_ARCHIVE, archive.byteLength)
            expect(result.entryCount).toBe(3)
        })
    })

    test('경로 순회와 symlink archive entry를 거부합니다', async () => {
        const pathTraversal = await createArchive([{ body: Buffer.from('bad'), name: '../escape' }])
        const symlink = await createArchive([{ name: 'link', type: 'symlink' }])

        await withArchive(pathTraversal, async (filePath) => {
            await expect(
                createArtifactInspectionService().inspect(filePath, ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE, pathTraversal.byteLength),
            ).rejects.toThrow('ARCHIVE_PATH_INVALID')
        })
        await withArchive(symlink, async (filePath) => {
            await expect(
                createArtifactInspectionService().inspect(filePath, ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE, symlink.byteLength),
            ).rejects.toThrow('ARCHIVE_ENTRY_TYPE_INVALID')
        })
    })
})
