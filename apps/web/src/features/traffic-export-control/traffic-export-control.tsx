'use client'

import { useEffect, useState, type FC } from 'react'
import { operationJobSchema } from '@containers/contracts/operation-job'
import { z } from 'zod'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'

const jobResponseSchema = z.object({ data: operationJobSchema, success: z.literal(true) })

type TrafficExportControlProps = {
    labels: {
        download: string
        exportCsv: string
        exportFailed: string
        exportNdjson: string
    }
}

export const TrafficExportControl: FC<TrafficExportControlProps> = ({ labels }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [jobId, setJobId] = useState<string>()
    const [status, setStatus] = useState<string>()

    useEffect(() => {
        if (!jobId || !['queued', 'running'].includes(status ?? '')) return
        const interval = setInterval(() => {
            void fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
                .then(async (response) => {
                    const body: unknown = await response.json()
                    if (!response.ok) throw new Error(parseApiError(body, labels.exportFailed))
                    const job = jobResponseSchema.parse(body).data
                    setStatus(job.status)
                    if (job.status === 'failed' || job.status === 'cancelled') setError(job.failureCode ?? labels.exportFailed)
                })
                .catch((pollError) => setError(pollError instanceof Error ? pollError.message : labels.exportFailed))
        }, 1_000)
        return () => clearInterval(interval)
    }, [jobId, labels.exportFailed, status])

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
            const job = jobResponseSchema.parse(body).data
            setJobId(job.id)
            setStatus(job.status)
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : labels.exportFailed)
        } finally {
            setBusy(false)
        }
    }

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
            {error ? <span className="text-xs text-red-400">{error}</span> : null}
        </div>
    )
}
