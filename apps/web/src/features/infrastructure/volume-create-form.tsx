'use client'

import type { FC } from 'react'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type VolumeCreateFormProps = {
    busy: boolean
    labels: {
        create: string
        volumeCreate: string
        volumeName: string
    }
    onCreate: (name: string) => void
}

export const VolumeCreateForm: FC<VolumeCreateFormProps> = ({ busy, labels, onCreate }) => (
    <form
        className="grid gap-4 bg-surface-3 p-5"
        onSubmit={(event) => {
            event.preventDefault()
            onCreate(String(new FormData(event.currentTarget).get('name') ?? '').trim())
        }}
    >
        <p className="text-sm font-medium text-text-strong">{labels.volumeCreate}</p>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="new-volume-name">{labels.volumeName}</Label>
                <Input id="new-volume-name" name="name" required />
            </div>
            <Button type="submit" size="sm" disabled={busy}>
                {labels.create}
            </Button>
        </div>
    </form>
)
