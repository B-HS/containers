'use client'

import type { FC } from 'react'
import { useRef, useState } from 'react'
import { formatBytes } from '@shared/lib/format-bytes'
import { cn } from '@shared/lib/utils'

const ACCEPTED_EXTENSIONS = '.tar,.tar.gz,.tgz'

type ArtifactFileDropProps = {
    disabled: boolean
    hint: string
    id: string
    onSelect: (file: File) => void
    selectedFile: File | undefined
}

export const ArtifactFileDrop: FC<ArtifactFileDropProps> = ({ disabled, hint, id, onSelect, selectedFile }) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)

    return (
        <>
            <button
                type="button"
                id={id}
                className={cn(
                    'grid min-h-20 w-full gap-1 p-4 text-left text-sm transition-colors',
                    dragOver ? 'bg-overlay-active' : 'bg-surface-3 hover:bg-overlay-hover',
                    disabled ? 'pointer-events-none opacity-50' : '',
                )}
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(false)
                    const file = event.dataTransfer.files[0]
                    if (file) {
                        onSelect(file)
                    }
                }}
            >
                {selectedFile ? (
                    <>
                        <span className="truncate font-medium text-text-strong">{selectedFile.name}</span>
                        <span className="text-xs tabular-nums text-text-subtle">{formatBytes(selectedFile.size)}</span>
                    </>
                ) : (
                    <>
                        <span className="text-text-muted">{ACCEPTED_EXTENSIONS.split(',').join(' · ')}</span>
                        <span className="text-xs text-text-subtle">{hint}</span>
                    </>
                )}
            </button>
            <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                        onSelect(file)
                    }
                }}
            />
        </>
    )
}
