'use client'

import type { FC } from 'react'

const PROGRESS_MIN = 0
const PROGRESS_MAX = 100

type UploadProgressProps = {
    description: string
    label: string
    value: number
}

export const UploadProgress: FC<UploadProgressProps> = ({ description, label, value }) => (
    <div className="grid gap-2">
        <div
            className="h-1.5 w-full bg-overlay-subtle"
            aria-label={label}
            aria-valuemax={PROGRESS_MAX}
            aria-valuemin={PROGRESS_MIN}
            aria-valuenow={value}
            role="progressbar"
        >
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${value}%` }} />
        </div>
        <p className="text-xs tabular-nums text-text-subtle">
            {description} · {value}%
        </p>
    </div>
)
