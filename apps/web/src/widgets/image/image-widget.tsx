'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { z } from 'zod'
import { imageSummaryListSchema } from '@containers/contracts/engine-control'
import { useRemoveImage } from '@entities/image/image.query'
import { formatBytes } from '@shared/lib/format-bytes'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

type ImageSummary = z.infer<typeof imageSummaryListSchema>[number]

type ImageWidgetProps = {
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

type ImageDetailCardProps = {
    busyId: string | undefined
    canRemove: boolean
    image: ImageSummary
    labels: ImageWidgetProps['labels']
    onRemove: (image: ImageSummary, confirmation: string, force: boolean) => void
}

const ImageDetailCard: FC<ImageDetailCardProps> = ({ busyId, canRemove, image, labels, onRemove }) => {
    const displayName = image.repoTags[0] ?? image.repoDigests[0] ?? image.id.replace(/^sha256:/, '').slice(0, 12)
    const [force, setForce] = useState(false)

    return (
        <div className="grid min-w-0 gap-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{image.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {labels.size}: {formatBytes(image.sizeBytes)}
                </p>
            </div>
            {canRemove ? (
                <form
                    className="grid gap-2 border-t border-background pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const formData = new FormData(event.currentTarget)
                        void onRemove(image, String(formData.get('confirmation') ?? ''), force)
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor={`image-confirmation-${image.id}`}>
                            {labels.confirmation}: {displayName}
                        </Label>
                        <Input id={`image-confirmation-${image.id}`} name="confirmation" autoComplete="off" required />
                    </div>
                    <Label htmlFor={`image-force-${image.id}`} className="flex h-10 items-center gap-2 px-3">
                        <Checkbox id={`image-force-${image.id}`} checked={force} onCheckedChange={(checked) => setForce(checked === true)} />{' '}
                        {labels.force}
                    </Label>
                    <Button variant="default" type="submit" disabled={busyId === image.id}>
                        {labels.remove}
                    </Button>
                </form>
            ) : null}
        </div>
    )
}

export const ImageWidget: FC<ImageWidgetProps> = ({ images: initialImages, labels, role }) => {
    const [images, setImages] = useState(initialImages)
    const [busyId, setBusyId] = useState<string>()
    const [error, setError] = useState<string>()
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(images)
    const canRemove = ['owner', 'admin'].includes(role)
    const removeImage = useRemoveImage()

    const remove = async (image: ImageSummary, confirmation: string, force: boolean) => {
        setBusyId(image.id)
        setError(undefined)
        try {
            await removeImage.mutateAsync({ id: image.id, confirmation, force })
            setImages((current) => current.filter((candidate) => candidate.id !== image.id))
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusyId(undefined)
        }
    }

    return (
        <WidgetSection id="image-control-title" title={labels.title} badge={images.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {images.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <MasterDetail
                empty={null}
                items={images.map((image) => {
                    const displayName = image.repoTags[0] ?? image.repoDigests[0] ?? image.id.replace(/^sha256:/, '').slice(0, 12)
                    return {
                        id: image.id,
                        subtitle: `${labels.size} ${formatBytes(image.sizeBytes)}`,
                        title: displayName,
                    }
                })}
                listLabel={labels.title}
                onSelect={onSelect}
                selectedId={selectedId}
            >
                {selectedItem ? (
                    <ImageDetailCard
                        busyId={busyId}
                        canRemove={canRemove}
                        image={selectedItem}
                        labels={labels}
                        onRemove={(image, confirmation, force) => void remove(image, confirmation, force)}
                    />
                ) : null}
            </MasterDetail>
        </WidgetSection>
    )
}
