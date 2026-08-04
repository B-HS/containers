'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { backupQueryOptions, useRemoveBackup, useRestoreBackup } from '@entities/backup/backup.query'
import { BackupConfirmDialog } from '@features/backup-confirm-dialog/backup-confirm-dialog'
import { formatBytes } from '@shared/lib/format-bytes'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Alert, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'
import { BackupCreateForm } from '@widgets/backup/backup-create-form'

const SKELETON_ROW_COUNT = 3

type BackupDialog = {
    backupId: string
    mode: 'remove' | 'restore'
}

type BackupWidgetProps = {
    canManage: boolean
}

export const BackupWidget: FC<BackupWidgetProps> = ({ canManage }) => {
    const [dialog, setDialog] = useState<BackupDialog>()
    const translations = useTranslations('Dashboard')
    const backups = useQuery({ ...backupQueryOptions(), enabled: canManage })
    const removeBackup = useRemoveBackup()
    const restoreBackup = useRestoreBackup()

    const items = backups.data ?? []
    const target = items.find((backup) => backup.id === dialog?.backupId)

    const closeDialog = () => setDialog(undefined)

    const restore = (confirmation: string) => {
        if (!target) return
        restoreBackup.mutate(
            { backupId: target.id, confirmation },
            {
                onError: (restoreError) => toast.error(restoreError instanceof Error ? restoreError.message : translations('backupFailed')),
                onSuccess: () => {
                    closeDialog()
                    toast.success(translations('backupRestored'))
                },
            },
        )
    }

    const remove = (confirmation: string) => {
        if (!target) return
        removeBackup.mutate(
            { backupId: target.id, confirmation },
            {
                onError: (removeError) => toast.error(removeError instanceof Error ? removeError.message : translations('backupFailed')),
                onSuccess: () => {
                    closeDialog()
                    toast.success(translations('backupRemoved'))
                },
            },
        )
    }

    if (!canManage) {
        return (
            <WidgetSection id="backup-control-title" title={translations('backupControl')} notice={translations('backupNotice')}>
                <Alert className="m-6 w-auto">
                    <AlertTitle>{translations('permissionRequired')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection id="backup-control-title" title={translations('backupControl')} notice={translations('backupNotice')} badge={items.length}>
            <BackupCreateForm />
            {backups.isPending ? (
                <div className="grid gap-2 p-6">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            ) : null}
            {!backups.isPending && items.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{translations('backupEmpty')}</EmptyTitle>
                        <EmptyDescription>{translations('backupEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {items.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{translations('backupLabel')}</TableHead>
                            <TableHead>{translations('checksum')}</TableHead>
                            <TableHead>{translations('size')}</TableHead>
                            <TableHead>{translations('createdAt')}</TableHead>
                            <TableHead className="text-right">{translations('backupRestore')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((backup) => (
                            <TableRow key={backup.id} className="odd:bg-overlay-subtle">
                                <TableCell className="max-w-56 truncate font-medium text-text-strong">{backup.label ?? backup.id}</TableCell>
                                <TableCell className="max-w-56 truncate font-mono text-xs text-text-subtle">{backup.id}</TableCell>
                                <TableCell className="text-text-muted">{formatBytes(backup.controlBytes + backup.trafficBytes)}</TableCell>
                                <TableCell className="text-text-muted">{formatDateTime(backup.createdAt)}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="xs"
                                            onClick={() => setDialog({ backupId: backup.id, mode: 'restore' })}
                                        >
                                            {translations('backupRestore')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="text-danger"
                                            onClick={() => setDialog({ backupId: backup.id, mode: 'remove' })}
                                        >
                                            {translations('remove')}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : null}
            {target && dialog?.mode === 'restore' ? (
                <BackupConfirmDialog
                    key={`restore-${target.id}`}
                    open
                    actionLabel={translations('backupRestore')}
                    cancelLabel={translations('cancel')}
                    confirmationLabel={translations('backupRestoreConfirmLabel')}
                    description={translations('backupRestoreDescription')}
                    expectedConfirmation={target.id}
                    inputId={`backup-restore-confirmation-${target.id}`}
                    pending={restoreBackup.isPending}
                    targetLabel={target.label ?? target.id}
                    title={translations('backupRestoreTitle')}
                    onConfirm={restore}
                    onOpenChange={closeDialog}
                />
            ) : null}
            {target && dialog?.mode === 'remove' ? (
                <BackupConfirmDialog
                    key={`remove-${target.id}`}
                    open
                    actionLabel={translations('remove')}
                    cancelLabel={translations('cancel')}
                    confirmationLabel={translations('backupRemoveConfirmLabel')}
                    description={translations('backupRemoveDescription')}
                    expectedConfirmation={target.id}
                    inputId={`backup-remove-confirmation-${target.id}`}
                    pending={removeBackup.isPending}
                    targetLabel={target.label ?? target.id}
                    title={translations('backupRemoveTitle')}
                    onConfirm={remove}
                    onOpenChange={closeDialog}
                />
            ) : null}
        </WidgetSection>
    )
}
