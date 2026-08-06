'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { VolumeSummary } from '@containers/contracts/engine-control'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { formatBytes } from '@shared/lib/format-bytes'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Label } from '@shared/ui/label'

type VolumeDetailCardProps = {
    busy: boolean
    canRemove: boolean
    labels: {
        cancel: string
        confirmation: string
        confirmationMismatch: string
        confirmRemoveTitle: string
        containers: string
        driver: string
        force: string
        remove: string
        size: string
        volumeRemoveImpact: string
        volumes: string
    }
    onRemove: (volumeName: string, confirmation: string, force: boolean) => void
    volume: VolumeSummary
}

export const VolumeDetailCard: FC<VolumeDetailCardProps> = ({ busy, canRemove, labels, onRemove, volume }) => {
    const [force, setForce] = useState(false)

    return (
        <div className="grid min-w-0 gap-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold text-text-strong">{volume.name}</h3>
                <Badge variant="neutral">{volume.driver}</Badge>
            </div>
            <dl className="grid min-w-0 gap-4 text-xs sm:grid-cols-3">
                <div className="min-w-0">
                    <dt className="text-text-subtle">{labels.volumes}</dt>
                    <dd className="mt-1 truncate font-mono text-sm text-text-strong">{volume.name}</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-text-subtle">{labels.size}</dt>
                    <dd className="mt-1 truncate font-mono text-sm text-text-strong tabular-nums">{formatBytes(volume.sizeBytes)}</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-text-subtle">{labels.containers}</dt>
                    <dd className="mt-1 truncate text-sm text-text-strong tabular-nums">{volume.refCount}</dd>
                </div>
            </dl>
            {canRemove && (
                <div className="bg-overlay-subtle p-4">
                    <ConfirmRemoveDialog
                        cancelLabel={labels.cancel}
                        confirmationLabel={labels.confirmation}
                        description={labels.volumeRemoveImpact}
                        disabled={busy}
                        expectedValue={volume.name}
                        inputId={`volume-confirm-${volume.name}`}
                        mismatchLabel={labels.confirmationMismatch}
                        onConfirm={() => onRemove(volume.name, volume.name, force)}
                        removeLabel={labels.remove}
                        target={volume.name}
                        title={labels.confirmRemoveTitle}
                        trigger={
                            <Button size="sm" type="button" variant="destructive">
                                {labels.remove}
                            </Button>
                        }
                    >
                        <Label htmlFor={`volume-force-${volume.name}`}>
                            <Checkbox id={`volume-force-${volume.name}`} checked={force} onCheckedChange={(checked) => setForce(checked === true)} />
                            {labels.force}
                        </Label>
                    </ConfirmRemoveDialog>
                </div>
            )}
        </div>
    )
}
