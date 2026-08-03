'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { z } from 'zod'
import { backupManifestSchema } from '@containers/contracts/backup'
import { formatBytes } from '@shared/lib/format-bytes'
import { formatDateTime } from '@shared/lib/format-date-time'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

type BackupManifest = z.infer<typeof backupManifestSchema>

type BackupWidgetProps = {
    backups: BackupManifest[]
    labels: {
        confirmation: string
        create: string
        empty: string
        failed: string
        label: string
        notice: string
        remove: string
        restore: string
        restored: string
        size: string
        title: string
    }
}

const createResponseSchema = z.object({ data: backupManifestSchema, success: z.literal(true) })

export const BackupWidget: FC<BackupWidgetProps> = ({ backups: initialBackups, labels }) => {
    const [backups, setBackups] = useState(initialBackups)
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const [status, setStatus] = useState<string>()
    const { onSelect, selectedId, selectedItem: selectedBackup } = useMasterDetailSelection(backups)

    const create = async (form: HTMLFormElement) => {
        setBusy('create')
        setError(undefined)
        setStatus(undefined)
        try {
            const formData = new FormData(form)
            const label = String(formData.get('label') ?? '').trim()
            const response = await fetch('/api/backups', {
                body: JSON.stringify({ label: label || null }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            const body: unknown = await response.json()
            if (!response.ok) throw new Error(parseApiError(body, labels.failed))
            const backup = createResponseSchema.parse(body).data
            setBackups((current) => [backup, ...current])
            form.reset()
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const mutate = async (backup: BackupManifest, operation: 'remove' | 'restore', confirmation: string) => {
        setBusy(`${operation}:${backup.id}`)
        setError(undefined)
        setStatus(undefined)
        try {
            const response = await fetch(`/api/backups/${backup.id}${operation === 'restore' ? '/restore' : ''}`, {
                body: JSON.stringify({ confirmation }),
                headers: { 'content-type': 'application/json' },
                method: operation === 'restore' ? 'POST' : 'DELETE',
            })
            const body: unknown = await response.json()
            if (!response.ok) throw new Error(parseApiError(body, labels.failed))
            if (operation === 'remove') {
                setBackups((current) => current.filter((item) => item.id !== backup.id))
            } else {
                setStatus(labels.restored)
                window.setTimeout(() => window.location.reload(), 800)
            }
        } catch (mutationError) {
            setError(mutationError instanceof Error ? mutationError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="backup-control-title" title={labels.title} notice={labels.notice} badge={backups.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {status ? <InlineAlert tone="notice">{status}</InlineAlert> : null}
            <form
                className="flex min-w-0 gap-px border-t border-background p-3"
                onSubmit={(event) => {
                    event.preventDefault()
                    void create(event.currentTarget)
                }}
            >
                <Label htmlFor="backup-label" className="sr-only">
                    {labels.label}
                </Label>
                <Input id="backup-label" name="label" className="min-w-0" maxLength={100} placeholder={labels.label} />
                <Button type="submit" variant="default" disabled={busy === 'create'}>
                    {labels.create}
                </Button>
            </form>
            {backups.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            {selectedBackup ? (
                <MasterDetail
                    empty={labels.empty}
                    items={backups.map((backup) => ({
                        id: backup.id,
                        subtitle: formatDateTime(backup.createdAt) ?? backup.id,
                        title: backup.label ?? backup.id,
                    }))}
                    listLabel={labels.title}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-3 p-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{selectedBackup.label ?? selectedBackup.id}</p>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{selectedBackup.id}</p>
                            </div>
                            <Badge variant="muted">
                                {labels.size} {formatBytes(selectedBackup.controlBytes + selectedBackup.trafficBytes)}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(selectedBackup.createdAt)}</p>
                        <form
                            className="grid gap-1"
                            onSubmit={(event) => {
                                event.preventDefault()
                                const formData = new FormData(event.currentTarget)
                                const operation = String(formData.get('operation')) === 'restore' ? 'restore' : 'remove'
                                void mutate(selectedBackup, operation, String(formData.get('confirmation') ?? ''))
                            }}
                        >
                            <Label htmlFor={`backup-confirmation-${selectedBackup.id}`}>{labels.confirmation}</Label>
                            <Input id={`backup-confirmation-${selectedBackup.id}`} name="confirmation" className="min-w-0" />
                            <div className="flex gap-px">
                                <Button name="operation" value="restore" type="submit" variant="default" disabled={Boolean(busy)}>
                                    {labels.restore}
                                </Button>
                                <Button name="operation" value="remove" type="submit" variant="default" disabled={Boolean(busy)}>
                                    {labels.remove}
                                </Button>
                            </div>
                        </form>
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
