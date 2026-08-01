'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { createSHA256 } from 'hash-wasm'
import { z } from 'zod'
import { ARTIFACT_MEDIA_TYPE, artifactListSchema, artifactSchema, uploadSessionSchema } from '@containers/contracts/upload'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type Artifact = z.infer<typeof artifactListSchema>[number]
const artifactResponseSchema = z.object({ data: artifactSchema, success: z.literal(true) })
const uploadSessionResponseSchema = z.object({ data: uploadSessionSchema, success: z.literal(true) })

type ArtifactControlWidgetProps = {
    artifacts: Artifact[]
    labels: {
        artifactType: string
        checksum: string
        empty: string
        failed: string
        file: string
        load: string
        loading: string
        progress: string
        title: string
        upload: string
        uploading: string
        storageWarning: string
    }
    role: string
}

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')

const hashFile = async (file: File, onProgress: (value: number) => void) => {
    const hasher = await createSHA256()
    const hashChunkBytes = 8_388_608
    for (let offset = 0; offset < file.size; offset += hashChunkBytes) {
        hasher.update(new Uint8Array(await file.slice(offset, Math.min(offset + hashChunkBytes, file.size)).arrayBuffer()))
        onProgress(Math.round((Math.min(offset + hashChunkBytes, file.size) / file.size) * 25))
    }
    return hasher.digest()
}

export const ArtifactControlWidget: FC<ArtifactControlWidgetProps> = ({ artifacts: initialArtifacts, labels, role }) => {
    const [artifacts, setArtifacts] = useState(initialArtifacts)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [progress, setProgress] = useState(0)
    const [warning, setWarning] = useState<string>()
    const canUpload = ['owner', 'admin', 'operator'].includes(role)
    const canLoad = ['owner', 'admin'].includes(role)

    const upload = async (file: File, mediaType: string) => {
        setBusy(true)
        setError(undefined)
        setWarning(undefined)
        setProgress(0)
        try {
            const expectedSha256 = await hashFile(file, setProgress)
            const sessionResponse = await fetch('/api/uploads/sessions', {
                body: JSON.stringify({ expectedSha256, expectedSizeBytes: file.size, fileName: file.name, mediaType }),
                headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
                method: 'POST',
            })
            const sessionBody: unknown = await sessionResponse.json()
            if (!sessionResponse.ok) {
                throw new Error(parseApiError(sessionBody, labels.failed))
            }
            const session = uploadSessionResponseSchema.parse(sessionBody).data
            if (session.warnings.includes('DISK_SOFT_WATERMARK')) {
                setWarning(labels.storageWarning)
            }
            for (let offset = 0; offset < file.size; offset += session.maxChunkBytes) {
                const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + session.maxChunkBytes, file.size)).arrayBuffer())
                const chunkSha256 = toHex(await crypto.subtle.digest('SHA-256', chunk))
                const response = await fetch(`/api/uploads/sessions/${encodeURIComponent(session.id)}/chunks?offset=${offset}`, {
                    body: chunk,
                    headers: { 'content-type': 'application/octet-stream', 'x-chunk-sha256': chunkSha256 },
                    method: 'PUT',
                })
                if (!response.ok) {
                    throw new Error(parseApiError(await response.json(), labels.failed))
                }
                setProgress(25 + Math.round((Math.min(offset + session.maxChunkBytes, file.size) / file.size) * 70))
            }
            const finalizeResponse = await fetch(`/api/uploads/sessions/${encodeURIComponent(session.id)}/finalize`, { method: 'POST' })
            const finalizeBody: unknown = await finalizeResponse.json()
            if (!finalizeResponse.ok) {
                throw new Error(parseApiError(finalizeBody, labels.failed))
            }
            setArtifacts((current) => [artifactResponseSchema.parse(finalizeBody).data, ...current])
            setProgress(100)
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    const load = async (artifactId: string) => {
        setBusy(true)
        setError(undefined)
        try {
            const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/load`, { method: 'POST' })
            const body = await response.json()
            if (!response.ok) {
                throw new Error(parseApiError(body, labels.failed))
            }
            window.location.reload()
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="artifact-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="artifact-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{artifacts.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {warning ? (
                <p className="mx-3 mb-3 bg-amber-950 p-3 text-sm text-amber-100" role="status">
                    {warning}
                </p>
            ) : null}
            {canUpload ? (
                <form
                    className="grid gap-3 border-t border-background p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const formData = new FormData(event.currentTarget)
                        const file = formData.get('file')
                        if (file instanceof File && file.size > 0) {
                            void upload(file, String(formData.get('mediaType')))
                        }
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="artifact-file">{labels.file}</Label>
                        <Input id="artifact-file" name="file" type="file" accept=".tar,.tar.gz,.tgz" required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="artifact-media-type">{labels.artifactType}</Label>
                        <select id="artifact-media-type" name="mediaType" className="h-10 bg-background px-3 text-sm">
                            <option value={ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE}>Docker image archive</option>
                            <option value={ARTIFACT_MEDIA_TYPE.OCI_IMAGE_ARCHIVE}>OCI image archive</option>
                        </select>
                    </div>
                    <Button type="submit" disabled={busy}>
                        {busy ? labels.uploading : labels.upload}
                    </Button>
                    {progress > 0 ? (
                        <div
                            className="md:col-span-3"
                            aria-label={labels.progress}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={progress}
                            role="progressbar"
                        >
                            <div className="h-2 bg-background">
                                <div className="h-2 bg-foreground" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
                        </div>
                    ) : null}
                </form>
            ) : null}
            {artifacts.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background">
                {artifacts.map((artifact) => (
                    <Card key={artifact.id} className="min-w-0 gap-3 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{artifact.fileName}</p>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {labels.checksum}: {artifact.sha256}
                                </p>
                            </div>
                            <div className="flex items-center gap-px">
                                <Badge variant="muted">{artifact.status}</Badge>
                                {canLoad && artifact.status === 'ready' ? (
                                    <Button type="button" disabled={busy} onClick={() => void load(artifact.id)}>
                                        {busy ? labels.loading : labels.load}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    )
}
