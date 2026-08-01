'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { z } from 'zod'
import { imageSummaryListSchema } from '@containers/contracts/engine-control'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type ImageSummary = z.infer<typeof imageSummaryListSchema>[number]

type ImageControlWidgetProps = {
    images: ImageSummary[]
    labels: {
        confirmation: string
        empty: string
        failed: string
        force: string
        remove: string
        size: string
        title: string
    }
    role: string
}

const formatSize = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MiB`

export const ImageControlWidget: FC<ImageControlWidgetProps> = ({ images: initialImages, labels, role }) => {
    const [images, setImages] = useState(initialImages)
    const [busyId, setBusyId] = useState<string>()
    const [error, setError] = useState<string>()
    const canRemove = ['owner', 'admin'].includes(role)

    const remove = async (image: ImageSummary, confirmation: string, force: boolean) => {
        setBusyId(image.id)
        setError(undefined)
        try {
            const response = await fetch(`/api/images/${encodeURIComponent(image.id)}`, {
                body: JSON.stringify({ confirmation, force, pruneChildren: false }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            setImages((current) => current.filter((candidate) => candidate.id !== image.id))
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusyId(undefined)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="image-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="image-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{images.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {images.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background">
                {images.map((image) => {
                    const displayName = image.repoTags[0] ?? image.repoDigests[0] ?? image.id.replace(/^sha256:/, '').slice(0, 12)
                    return (
                        <Card key={image.id} className="min-w-0 gap-3 p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{displayName}</p>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{image.id}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {labels.size}: {formatSize(image.sizeBytes)}
                                </p>
                            </div>
                            {canRemove ? (
                                <form
                                    className="grid gap-2 border-t border-background pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const formData = new FormData(event.currentTarget)
                                        void remove(image, String(formData.get('confirmation') ?? ''), formData.get('force') === 'on')
                                    }}
                                >
                                    <div className="grid gap-2">
                                        <Label htmlFor={`image-confirmation-${image.id}`}>
                                            {labels.confirmation}: {displayName}
                                        </Label>
                                        <Input id={`image-confirmation-${image.id}`} name="confirmation" autoComplete="off" required />
                                    </div>
                                    <Label className="flex h-10 items-center gap-2 px-3">
                                        <input name="force" type="checkbox" /> {labels.force}
                                    </Label>
                                    <Button className="bg-red-700 text-white" type="submit" disabled={busyId === image.id}>
                                        {labels.remove}
                                    </Button>
                                </form>
                            ) : null}
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}
