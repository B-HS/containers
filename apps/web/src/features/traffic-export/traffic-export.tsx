'use client'

import { useState, type FC } from 'react'
import { Button } from '@shared/ui/button'

type TrafficExportProps = {
    createExport: (input: { format: 'csv' | 'ndjson'; from: string; to: string }) => Promise<{ id: string }>
    jobError: string | undefined
    jobId: string | undefined
    labels: {
        download: string
        exportCsv: string
        exportFailed: string
        exportNdjson: string
    }
    status: string | undefined
}

export const TrafficExport: FC<TrafficExportProps> = ({ createExport, jobError, jobId, labels, status }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()

    const submitExport = async (format: 'csv' | 'ndjson') => {
        setBusy(true)
        setError(undefined)
        try {
            const to = new Date()
            const from = new Date(to.getTime() - 60 * 60 * 1_000)
            await createExport({ format, from: from.toISOString(), to: to.toISOString() })
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : labels.exportFailed)
        } finally {
            setBusy(false)
        }
    }

    const displayedError = error ?? jobError

    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void submitExport('csv')} type="button">
                {labels.exportCsv}
            </Button>
            <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void submitExport('ndjson')} type="button">
                {labels.exportNdjson}
            </Button>
            {jobId && status === 'succeeded' ? (
                <a className="px-2 text-xs underline" href={`/api/traffic/exports/${encodeURIComponent(jobId)}/download`}>
                    {labels.download}
                </a>
            ) : null}
            {jobId && status !== 'succeeded' ? <span className="text-xs text-muted-foreground">{status}</span> : null}
            {displayedError ? <span className="text-xs text-red-400">{displayedError}</span> : null}
        </div>
    )
}
