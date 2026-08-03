'use client'

import { useState, type FC } from 'react'
import { jobResponseSchema } from '@entities/job/job.api'
import { useOperationJobPolling } from '@entities/job/job.query'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'

type TrafficExportProps = {
    labels: {
        download: string
        exportCsv: string
        exportFailed: string
        exportNdjson: string
    }
}

export const TrafficExport: FC<TrafficExportProps> = ({ labels }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()

    const createExport = async (format: 'csv' | 'ndjson') => {
        setBusy(true)
        setError(undefined)
        try {
            const to = new Date()
            const from = new Date(to.getTime() - 60 * 60 * 1_000)
            const response = await fetch('/api/traffic/exports', {
                body: JSON.stringify({ format, from: from.toISOString(), to: to.toISOString() }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            const body: unknown = await response.json()
            if (!response.ok) throw new Error(parseApiError(body, labels.exportFailed))
            trackJob(jobResponseSchema.parse(body).data)
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : labels.exportFailed)
        } finally {
            setBusy(false)
        }
    }

    const { error: jobError, jobId, status, trackJob } = useOperationJobPolling({ failureLabel: labels.exportFailed })
    const displayedError = error ?? jobError

    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void createExport('csv')} type="button">
                {labels.exportCsv}
            </Button>
            <Button className="h-7 px-2 text-xs" disabled={busy} onClick={() => void createExport('ndjson')} type="button">
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
