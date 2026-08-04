'use client'

import { useEffect, useState, type FC } from 'react'
import { toast } from 'sonner'
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
        exportReady: string
        exportStarted: string
    }
    status: string | undefined
}

const EXPORT_WINDOW_MS = 60 * 60 * 1_000
const SUCCEEDED_STATUS = 'succeeded'

export const TrafficExport: FC<TrafficExportProps> = ({ createExport, jobError, jobId, labels, status }) => {
    const [busy, setBusy] = useState(false)

    const submitExport = async (format: 'csv' | 'ndjson') => {
        setBusy(true)
        try {
            const to = new Date()
            const from = new Date(to.getTime() - EXPORT_WINDOW_MS)
            await createExport({ format, from: from.toISOString(), to: to.toISOString() })
            toast.success(labels.exportStarted)
        } catch (exportError) {
            toast.error(exportError instanceof Error ? exportError.message : labels.exportFailed)
        } finally {
            setBusy(false)
        }
    }

    useEffect(() => {
        if (status !== SUCCEEDED_STATUS) return
        toast.success(labels.exportReady)
    }, [labels.exportReady, status])

    useEffect(() => {
        if (jobError === undefined) return
        toast.error(jobError)
    }, [jobError])

    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            <Button disabled={busy} onClick={() => void submitExport('csv')} size="xs" type="button" variant="outline">
                {labels.exportCsv}
            </Button>
            <Button disabled={busy} onClick={() => void submitExport('ndjson')} size="xs" type="button" variant="outline">
                {labels.exportNdjson}
            </Button>
            {jobId && status === SUCCEEDED_STATUS ? (
                <Button asChild size="xs" variant="outline">
                    <a href={`/api/traffic/exports/${encodeURIComponent(jobId)}/download`}>{labels.download}</a>
                </Button>
            ) : null}
            {jobId && status !== undefined && status !== SUCCEEDED_STATUS ? <span className="px-2 text-xs text-text-subtle">{status}</span> : null}
        </div>
    )
}
