'use client'

import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { createSHA256 } from 'hash-wasm'
import { artifactListSchema, uploadSessionSchema } from '@containers/contracts/upload'
import { artifactLoadResponseSchema, uploadFinalizeResponseSchema } from '@entities/artifact/artifact.api'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const HASH_CHUNK_BYTES = 8_388_608
const HASH_PROGRESS_RATIO = 25
const TRANSFER_PROGRESS_RATIO = 70
const COMPLETE_PROGRESS = 100
const UPLOADING_STATUS = 'uploading'

type UploadArtifactInput = {
    file: File
    mediaType: string
    onProgress?: (value: number) => void
    signal?: AbortSignal
}

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')

const hashFile = async (file: File, onProgress?: (value: number) => void) => {
    const hasher = await createSHA256()
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
        const end = Math.min(offset + HASH_CHUNK_BYTES, file.size)
        hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()))
        onProgress?.(Math.round((end / file.size) * HASH_PROGRESS_RATIO))
    }
    return hasher.digest()
}

export const artifactQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.ARTIFACT.LIST,
        queryFn: () => clientFetchData<z.infer<typeof artifactListSchema>>('/api/artifacts'),
    })

export const useGetArtifacts = () => useQuery(artifactQueryOptions())

export const useUploadArtifact = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ file, mediaType, onProgress, signal }: UploadArtifactInput) => {
            const expectedSha256 = await hashFile(file, onProgress)
            const sessionBody = await clientFetch('/api/uploads/sessions', {
                body: JSON.stringify({ expectedSha256, expectedSizeBytes: file.size, fileName: file.name, mediaType }),
                headers: { 'content-type': 'application/json', 'idempotency-key': expectedSha256 },
                method: 'POST',
                ...(signal ? { signal } : {}),
            })
            const session = uploadSessionSchema.parse(
                sessionBody && typeof sessionBody === 'object' && 'data' in sessionBody ? sessionBody.data : undefined,
            )

            const startOffset = session.status === UPLOADING_STATUS ? session.receivedBytes : file.size
            for (let offset = startOffset; offset < file.size; offset += session.maxChunkBytes) {
                const end = Math.min(offset + session.maxChunkBytes, file.size)
                const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer())
                const chunkSha256 = toHex(await crypto.subtle.digest('SHA-256', chunk))
                await clientFetchData<unknown>(`/api/uploads/sessions/${encodeURIComponent(session.id)}/chunks?offset=${offset}`, {
                    body: chunk,
                    headers: { 'content-type': 'application/octet-stream', 'x-chunk-sha256': chunkSha256 },
                    method: 'PUT',
                    ...(signal ? { signal } : {}),
                })
                onProgress?.(HASH_PROGRESS_RATIO + Math.round((end / file.size) * TRANSFER_PROGRESS_RATIO))
            }

            const finalizeBody = await clientFetch(`/api/uploads/sessions/${encodeURIComponent(session.id)}/finalize`, {
                method: 'POST',
                ...(signal ? { signal } : {}),
            })
            onProgress?.(COMPLETE_PROGRESS)
            return { job: uploadFinalizeResponseSchema.parse(finalizeBody).data.job, warnings: session.warnings }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.ARTIFACT.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.JOB.ALL })
        },
    })
}

export const useLoadArtifact = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (artifactId: string) =>
            artifactLoadResponseSchema.parse(await clientFetch(`/api/artifacts/${encodeURIComponent(artifactId)}/load`, { method: 'POST' })).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.ARTIFACT.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.IMAGE.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.JOB.ALL })
        },
    })
}
