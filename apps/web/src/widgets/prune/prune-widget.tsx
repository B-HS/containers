'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { PrunePreview } from '@containers/contracts/engine-control'
import { usePrune } from '@entities/infrastructure/infrastructure.query'
import { clientFetchData } from '@shared/lib/client-fetch'
import { formatBytes } from '@shared/lib/format-bytes'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { WidgetSection } from '@shared/common/widget-section'

type PruneWidgetProps = {
    initialPreview: PrunePreview | undefined
    labels: {
        buildCache: string
        confirmation: string
        containers: string
        execute: string
        failed: string
        images: string
        includeVolumes: string
        networks: string
        notice: string
        preview: string
        protected: string
        reclaimable: string
        started: string
        title: string
        volumes: string
    }
    role: string
}

const CONFIRMATION = 'DELETE UNUSED RESOURCES'

export const PruneWidget: FC<PruneWidgetProps> = ({ initialPreview, labels, role }) => {
    const [busy, setBusy] = useState<'execute' | 'preview'>()
    const [confirmation, setConfirmation] = useState('')
    const [error, setError] = useState<string>()
    const [includeVolumes, setIncludeVolumes] = useState(false)
    const [preview, setPreview] = useState(initialPreview)
    const [previewIncludesVolumes, setPreviewIncludesVolumes] = useState(false)
    const [started, setStarted] = useState(false)
    const canExecute = role === 'owner'
    const candidateCount = preview
        ? preview.buildCache.length + preview.containers.length + preview.images.length + preview.networks.length + preview.volumes.length
        : 0
    const pruneMutation = usePrune()

    const refreshPreview = async () => {
        setBusy('preview')
        setError(undefined)
        setStarted(false)
        try {
            const data = await clientFetchData<PrunePreview>(`/api/system/prune-preview?includeVolumes=${includeVolumes}`)
            setPreview(data)
            setPreviewIncludesVolumes(includeVolumes)
            setConfirmation('')
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const execute = async () => {
        if (!preview) {
            return
        }
        setBusy('execute')
        setError(undefined)
        try {
            await pruneMutation.mutateAsync({ confirmation, includeVolumes, previewSha256: preview.sha256 })
            setStarted(true)
            setConfirmation('')
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="prune-control-title" title={labels.title} badge={candidateCount}>
            <div className="grid gap-px bg-background">
                <Card className="gap-3 p-3">
                    <p className="text-sm text-muted-foreground">{labels.notice}</p>
                    {preview ? (
                        <dl className="grid grid-cols-2 gap-px bg-background text-xs sm:grid-cols-4">
                            {[
                                [labels.containers, preview.containers.length],
                                [labels.images, preview.images.length],
                                [labels.networks, preview.networks.length],
                                [labels.volumes, preview.volumes.length],
                                [labels.buildCache, preview.buildCache.length],
                                [labels.protected, preview.protectedResourceCount],
                                [labels.reclaimable, formatBytes(preview.reclaimableBytes)],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-card p-2">
                                    <dt className="text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 font-mono font-semibold">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : null}
                </Card>
                <Card className="gap-3 p-3">
                    <label className="flex items-center gap-2 text-xs">
                        <input checked={includeVolumes} onChange={(event) => setIncludeVolumes(event.target.checked)} type="checkbox" />
                        {labels.includeVolumes}
                    </label>
                    <Button type="button" variant="default" disabled={busy !== undefined} onClick={() => void refreshPreview()}>
                        {labels.preview}
                    </Button>
                    {canExecute && preview && candidateCount > 0 && previewIncludesVolumes === includeVolumes ? (
                        <form
                            className="grid gap-2"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void execute()
                            }}
                        >
                            <Label htmlFor="prune-confirmation">
                                {labels.confirmation}: {CONFIRMATION}
                            </Label>
                            <Input id="prune-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                            <Button type="submit" variant="default" disabled={busy !== undefined || confirmation !== CONFIRMATION}>
                                {labels.execute}
                            </Button>
                        </form>
                    ) : null}
                    {started ? <p className="text-xs text-emerald-700">{labels.started}</p> : null}
                    {error ? (
                        <p className="text-xs text-red-700" role="alert">
                            {error}
                        </p>
                    ) : null}
                </Card>
            </div>
        </WidgetSection>
    )
}
