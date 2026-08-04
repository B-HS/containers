'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { usePrune, useGetPrunePreview } from '@entities/infrastructure/infrastructure.query'
import { formatBytes } from '@shared/lib/format-bytes'
import { Alert, AlertDescription } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui/empty'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { Spinner } from '@shared/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'
import { PruneConfirmDialog } from './prune-confirm-dialog'

const SKELETON_ROWS = [0, 1, 2]

type PruneWidgetProps = {
    role: string
}

export const PruneWidget: FC<PruneWidgetProps> = ({ role }) => {
    const [includeVolumes, setIncludeVolumes] = useState(false)
    const t = useTranslations('Dashboard')
    const preview = useGetPrunePreview(includeVolumes)
    const pruneMutation = usePrune()
    const canExecute = role === 'owner'
    const data = preview.data
    const candidates = data
        ? [
              ...data.containers.map((candidate) => ({ ...candidate, kind: t('containers') })),
              ...data.images.map((candidate) => ({ ...candidate, kind: t('imageControl') })),
              ...data.networks.map((candidate) => ({ ...candidate, kind: t('networks') })),
              ...data.volumes.map((candidate) => ({ ...candidate, kind: t('volumes') })),
              ...data.buildCache.map((candidate) => ({ ...candidate, kind: t('pruneBuildCache') })),
          ]
        : []

    const execute = (confirmation: string) => {
        if (!data) {
            return
        }
        pruneMutation.mutate(
            { confirmation, includeVolumes, previewSha256: data.sha256 },
            {
                onError: () => toast.error(t('pruneFailed')),
                onSuccess: () => toast.success(t('pruneStarted')),
            },
        )
    }

    return (
        <WidgetSection id="prune-control-title" title={t('pruneTitle')} badge={candidates.length}>
            <div className="grid gap-px bg-background">
                <div className="grid gap-4 bg-surface-1 p-6">
                    <Alert>
                        <AlertDescription>{t('pruneNotice')}</AlertDescription>
                    </Alert>
                    {data ? (
                        <dl className="grid grid-cols-2 gap-px bg-background text-xs sm:grid-cols-4">
                            {[
                                { label: t('containers'), value: String(data.containers.length) },
                                { label: t('imageControl'), value: String(data.images.length) },
                                { label: t('networks'), value: String(data.networks.length) },
                                { label: t('volumes'), value: String(data.volumes.length) },
                                { label: t('pruneBuildCache'), value: String(data.buildCache.length) },
                                { label: t('pruneProtected'), value: String(data.protectedResourceCount) },
                                { label: t('pruneReclaimable'), value: formatBytes(data.reclaimableBytes) },
                            ].map((stat) => (
                                <div key={stat.label} className="bg-surface-2 p-4">
                                    <dt className="text-text-subtle">{stat.label}</dt>
                                    <dd className="mt-2 font-mono text-lg font-semibold text-text-strong tabular-nums">{stat.value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : null}
                </div>
                <div className="grid gap-4 bg-surface-1 p-6">
                    <div className="grid gap-1 bg-overlay-subtle p-3">
                        <Label htmlFor="prune-include-volumes">
                            <Checkbox
                                id="prune-include-volumes"
                                checked={includeVolumes}
                                onCheckedChange={(checked) => setIncludeVolumes(checked === true)}
                            />
                            {t('pruneIncludeVolumes')}
                        </Label>
                        <p className="pl-6 text-xs text-text-subtle">{t('pruneIncludeVolumesHelp')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={preview.isFetching} onClick={() => void preview.refetch()}>
                            {preview.isFetching ? <Spinner /> : null}
                            {t('prunePreview')}
                        </Button>
                        {canExecute && data && candidates.length > 0 ? (
                            <PruneConfirmDialog
                                candidateCount={candidates.length}
                                isExecuting={pruneMutation.isPending}
                                onConfirm={execute}
                                protectedCount={data.protectedResourceCount}
                                reclaimableLabel={formatBytes(data.reclaimableBytes)}
                            />
                        ) : null}
                    </div>
                </div>
                {preview.isPending ? (
                    <div className="grid gap-2 bg-surface-1 p-4">
                        {SKELETON_ROWS.map((row) => (
                            <Skeleton key={row} className="h-10 w-full" />
                        ))}
                    </div>
                ) : null}
                {!preview.isPending && candidates.length === 0 ? (
                    <div className="bg-surface-1">
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Sparkles aria-hidden="true" />
                                </EmptyMedia>
                                <EmptyTitle>{t('pruneEmpty')}</EmptyTitle>
                                <EmptyDescription>{t('pruneEmptyDescription')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : null}
                {candidates.length > 0 ? (
                    <div className="bg-surface-1">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('pruneResource')}</TableHead>
                                    <TableHead>{t('pruneName')}</TableHead>
                                    <TableHead className="text-right">{t('pruneReclaimable')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {candidates.map((candidate) => (
                                    <TableRow key={`${candidate.kind}-${candidate.id}`} className="odd:bg-overlay-subtle">
                                        <TableCell className="text-text-muted">{candidate.kind}</TableCell>
                                        <TableCell className="max-w-80 truncate font-mono text-xs text-text-strong">
                                            {candidate.name ?? candidate.id}
                                        </TableCell>
                                        <TableCell className="text-right text-text-muted">{formatBytes(candidate.reclaimableBytes)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : null}
            </div>
        </WidgetSection>
    )
}
