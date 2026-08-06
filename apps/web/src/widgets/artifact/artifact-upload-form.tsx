'use client'

import type { FC, FormEvent } from 'react'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ARTIFACT_MEDIA_TYPE } from '@containers/contracts/upload'
import { useUploadArtifact } from '@entities/artifact/artifact.query'
import { useOperationJobPolling } from '@entities/job/job.query'
import { ArtifactFileDrop } from '@features/artifact-file-drop/artifact-file-drop'
import { UploadProgress } from '@features/upload-progress/upload-progress'
import { QUERY_KEY } from '@shared/lib/query-key'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Spinner } from '@shared/ui/spinner'

const DISK_SOFT_WATERMARK = 'DISK_SOFT_WATERMARK'

export const ArtifactUploadForm: FC = () => {
    const abortRef = useRef<AbortController>(null)
    const [mediaType, setMediaType] = useState<string>(ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE)
    const [progress, setProgress] = useState(0)
    const [selectedFile, setSelectedFile] = useState<File>()
    const [storageWarning, setStorageWarning] = useState(false)
    const translations = useTranslations('Dashboard')
    const queryClient = useQueryClient()
    const uploadArtifact = useUploadArtifact()
    const { failureCode, isJobActive, trackJob } = useOperationJobPolling({
        failureLabel: translations('uploadFailed'),
        onFailed: (code) => {
            setProgress(0)
            toast.error(code ?? translations('uploadFailed'))
        },
        onSucceeded: () => {
            setProgress(0)
            return queryClient.invalidateQueries({ queryKey: QUERY_KEY.ARTIFACT.ALL })
        },
    })

    const busy = uploadArtifact.isPending || isJobActive

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!selectedFile) return
        setProgress(0)
        setStorageWarning(false)
        const controller = new AbortController()
        abortRef.current = controller
        uploadArtifact.mutate(
            { file: selectedFile, mediaType, onProgress: setProgress, signal: controller.signal },
            {
                onError: (uploadError) => {
                    setProgress(0)
                    if (controller.signal.aborted) {
                        toast.message(translations('uploadCancelled'))
                        return
                    }
                    toast.error(uploadError instanceof Error ? uploadError.message : translations('uploadFailed'))
                },
                onSuccess: (result) => {
                    setStorageWarning(result.warnings.includes(DISK_SOFT_WATERMARK))
                    trackJob(result.job)
                    toast.success(translations('artifactUploaded'))
                },
            },
        )
    }

    return (
        <form className="grid gap-4 bg-surface-3 p-6 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end" onSubmit={submit}>
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="artifact-file">{translations('file')}</Label>
                <ArtifactFileDrop
                    id="artifact-file"
                    disabled={busy}
                    hint={translations('file')}
                    selectedFile={selectedFile}
                    onSelect={setSelectedFile}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="artifact-media-type">{translations('artifactType')}</Label>
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
            <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={busy || selectedFile === undefined}>
                    {busy ? <Spinner /> : null}
                    {busy ? translations('uploading') : translations('upload')}
                </Button>
                {uploadArtifact.isPending ? (
                    <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
                        {translations('uploadCancel')}
                    </Button>
                ) : null}
            </div>
            {progress > 0 ? (
                <div className="md:col-span-3">
                    <UploadProgress
                        label={translations('uploadProgress')}
                        description={selectedFile?.name ?? translations('uploadProgress')}
                        value={progress}
                    />
                </div>
            ) : null}
            {storageWarning ? (
                <Alert variant="warning" className="md:col-span-3">
                    <AlertTitle>{translations('uploadStorageWarning')}</AlertTitle>
                </Alert>
            ) : null}
            {failureCode !== undefined ? (
                <Alert aria-live="polite" variant="destructive" className="md:col-span-3">
                    <AlertTitle>{translations('jobFailedTitle')}</AlertTitle>
                    <AlertDescription>
                        <span className="font-mono break-all">{failureCode ?? translations('jobFailedUnknown')}</span>
                    </AlertDescription>
                </Alert>
            ) : null}
        </form>
    )
}
