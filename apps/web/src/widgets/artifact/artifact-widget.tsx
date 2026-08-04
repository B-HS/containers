'use client'

import type { FC } from 'react'
import { useRef, useState } from 'react'
import { createSHA256 } from 'hash-wasm'
import { z } from 'zod'
import { ARTIFACT_MEDIA_TYPE, artifactListSchema, uploadSessionSchema } from '@containers/contracts/upload'
import { artifactLoadResponseSchema, uploadFinalizeResponseSchema } from '@entities/artifact/artifact.api'
import { useOperationJobPolling } from '@entities/job/job.query'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { WidgetSection } from '@shared/common/widget-section'

type Artifact = z.infer<typeof artifactListSchema>[number]

type ArtifactWidgetProps = {
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

export const ArtifactWidget: FC<ArtifactWidgetProps> = ({ artifacts: initialArtifacts, labels, role }) => {
    const [artifacts, setArtifacts] = useState(initialArtifacts)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [dragOver, setDragOver] = useState(false)
    const [mediaType, setMediaType] = useState<string>(ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE)
    const [progress, setProgress] = useState(0)
    const [selectedFile, setSelectedFile] = useState<File>()
    const [warning, setWarning] = useState<string>()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const canUpload = ['owner', 'admin', 'operator'].includes(role)
    const canLoad = ['owner', 'admin'].includes(role)

    const refreshArtifacts = async () => {
        const artifacts = await clientFetchData<z.infer<typeof artifactListSchema>>('/api/artifacts')
        setArtifacts(artifacts)
    }

    const upload = async (file: File) => {
        setBusy(true)
        setError(undefined)
        setWarning(undefined)
        setProgress(0)
        try {
            const expectedSha256 = await hashFile(file, setProgress)
            const sessionBody = await clientFetch('/api/uploads/sessions', {
                body: JSON.stringify({ expectedSha256, expectedSizeBytes: file.size, fileName: file.name, mediaType }),
                headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
                method: 'POST',
            })
            const session = uploadSessionSchema.parse(
                sessionBody && typeof sessionBody === 'object' && 'data' in sessionBody ? sessionBody.data : undefined,
            )
            if (session.warnings.includes('DISK_SOFT_WATERMARK')) {
                setWarning(labels.storageWarning)
            }
            for (let offset = 0; offset < file.size; offset += session.maxChunkBytes) {
                const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + session.maxChunkBytes, file.size)).arrayBuffer())
                const chunkSha256 = toHex(await crypto.subtle.digest('SHA-256', chunk))
                await clientFetchData<unknown>(`/api/uploads/sessions/${encodeURIComponent(session.id)}/chunks?offset=${offset}`, {
                    body: chunk,
                    headers: { 'content-type': 'application/octet-stream', 'x-chunk-sha256': chunkSha256 },
                    method: 'PUT',
                })
                setProgress(25 + Math.round((Math.min(offset + session.maxChunkBytes, file.size) / file.size) * 70))
            }
            const finalizeBody = await clientFetch(`/api/uploads/sessions/${encodeURIComponent(session.id)}/finalize`, { method: 'POST' })
            const finalized = uploadFinalizeResponseSchema.parse(finalizeBody).data
            trackJob(finalized.job)
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
            const body = await clientFetch(`/api/artifacts/${encodeURIComponent(artifactId)}/load`, { method: 'POST' })
            const loaded = artifactLoadResponseSchema.parse(body).data
            if ('job' in loaded) {
                trackJob(loaded.job)
            } else {
                await refreshArtifacts()
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    const { error: jobError, isJobActive, trackJob } = useOperationJobPolling({ failureLabel: labels.failed, onSucceeded: refreshArtifacts })
    const displayedError = error ?? jobError

    return (
        <WidgetSection id="artifact-control-title" title={labels.title} badge={artifacts.length}>
            {displayedError ? (
                <InlineAlert role="alert" tone="error">
                    {displayedError}
                </InlineAlert>
            ) : null}
            {warning ? <InlineAlert tone="warning">{warning}</InlineAlert> : null}
            {canUpload ? (
                <form
                    className="grid gap-3 border-t border-background p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (selectedFile) {
                            void upload(selectedFile)
                        }
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="artifact-file">{labels.file}</Label>
                        <button
                            type="button"
                            id="artifact-file"
                            className={`grid gap-1 border border-dashed p-3 text-left text-sm hover:bg-muted ${
                                dragOver ? 'border-foreground bg-muted' : 'border-border'
                            }`}
                            disabled={busy || isJobActive}
                            onClick={() => fileInputRef.current?.click()}
                            onDragEnter={() => setDragOver(true)}
                            onDragLeave={() => setDragOver(false)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault()
                                setDragOver(false)
                                const file = event.dataTransfer.files[0]
                                if (file) {
                                    setSelectedFile(file)
                                }
                            }}
                        >
                            {selectedFile ? (
                                <>
                                    <span className="truncate font-medium">{selectedFile.name}</span>
                                    <span className="text-xs text-muted-foreground">{(selectedFile.size / 1_048_576).toFixed(1)} MiB</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-muted-foreground">.tar · .tar.gz · .tgz</span>
                                    <span className="text-xs text-muted-foreground">{labels.file}</span>
                                </>
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            className="hidden"
                            type="file"
                            accept=".tar,.tar.gz,.tgz"
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                    setSelectedFile(file)
                                }
                            }}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="artifact-media-type">{labels.artifactType}</Label>
                        <Select value={mediaType} onValueChange={setMediaType}>
                            <SelectTrigger id="artifact-media-type" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE}>Docker image archive</SelectItem>
                                <SelectItem value={ARTIFACT_MEDIA_TYPE.OCI_IMAGE_ARCHIVE}>OCI image archive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" variant="default" disabled={busy || isJobActive || selectedFile === undefined}>
                        {busy || isJobActive ? labels.uploading : labels.upload}
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
                            <p className="mt-1 text-xs text-muted-foreground">
                                {selectedFile?.name ? `${selectedFile.name} · ` : ''}
                                {progress}%
                            </p>
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
                                    <Button type="button" disabled={busy || isJobActive} onClick={() => void load(artifact.id)}>
                                        {busy || isJobActive ? labels.loading : labels.load}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </WidgetSection>
    )
}
