'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AUDIT_RESULTS, AUDIT_TARGET_TYPES } from '@containers/contracts/audit'
import { AUDIT_DEFAULT_FILTERS, toAuditSearchParams, type AuditFilters } from '@entities/audit/audit.api'
import { useGetAuditEvents, useGetAuditIntegrity } from '@entities/audit/audit.query'
import { AuditEventRow } from '@features/audit-event-row/audit-event-row'
import { AuditIntegrityNotice } from '@features/audit-integrity-notice/audit-integrity-notice'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'

const ALL_VALUE = '__all__'
const ALWAYS_PRESENT_PARAM_COUNT = 2
const SKELETON_ROWS = [0, 1, 2, 3, 4]

const COLUMN_LABEL_KEYS = ['auditTime', 'auditOperation', 'auditTarget', 'auditActor', 'auditResult'] as const

export const AuditWidget: FC = () => {
    const [draft, setDraft] = useState<AuditFilters>(AUDIT_DEFAULT_FILTERS)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
    const [filters, setFilters] = useState<AuditFilters>(AUDIT_DEFAULT_FILTERS)
    const t = useTranslations('Dashboard')
    const eventsQuery = useGetAuditEvents(filters)
    const integrityQuery = useGetAuditIntegrity()
    const events = eventsQuery.data?.data ?? []
    const pagination = eventsQuery.data?.pagination
    const total = pagination?.total ?? 0
    const totalPages = pagination?.totalPages ?? 0
    const hasFilter = Object.keys(toAuditSearchParams(filters)).length > ALWAYS_PRESENT_PARAM_COUNT

    const updateDraft = (patch: Partial<AuditFilters>) => setDraft((current) => ({ ...current, ...patch }))

    const applyDraft = () => {
        setDraft((current) => ({ ...current, page: 1 }))
        setFilters({ ...draft, page: 1 })
    }

    const resetFilters = () => {
        setDraft(AUDIT_DEFAULT_FILTERS)
        setFilters(AUDIT_DEFAULT_FILTERS)
    }

    const changePage = (page: number) => {
        setDraft((current) => ({ ...current, page }))
        setFilters((current) => ({ ...current, page }))
    }

    const toggleExpanded = (id: string) => {
        setExpandedIds((current) => {
            const next = new Set(current)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    return (
        <WidgetSection id="audit-log-title" title={t('auditLog')} badge={total}>
            {integrityQuery.data !== undefined && (
                <AuditIntegrityNotice
                    brokenEntryLabel={t('auditIntegrityBrokenEntry')}
                    brokenLabel={t('auditIntegrityBroken', { sequence: integrityQuery.data.brokenAt ?? 0 })}
                    intactLabel={t('auditIntegrityIntact', { checked: integrityQuery.data.checked })}
                    integrity={integrityQuery.data}
                    unchainedLabel={t('auditIntegrityUnchained', { count: integrityQuery.data.unchained })}
                />
            )}
            <form
                aria-label={t('auditFilter')}
                className="grid gap-4 bg-surface-3 p-4 sm:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                    event.preventDefault()
                    applyDraft()
                }}
            >
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-actor-email">{t('auditFilterActor')}</Label>
                    <Input
                        id="audit-actor-email"
                        value={draft.actorEmail}
                        onChange={(event) => updateDraft({ actorEmail: event.target.value })}
                        placeholder="owner@example.com"
                    />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-target-id">{t('auditFilterTargetId')}</Label>
                    <Input id="audit-target-id" value={draft.targetId} onChange={(event) => updateDraft({ targetId: event.target.value })} />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-operation">{t('auditFilterOperation')}</Label>
                    <Input
                        id="audit-operation"
                        value={draft.operation}
                        onChange={(event) => updateDraft({ operation: event.target.value })}
                        placeholder="container.start"
                    />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-result">{t('auditFilterResult')}</Label>
                    <Select value={draft.result || ALL_VALUE} onValueChange={(value) => updateDraft({ result: value === ALL_VALUE ? '' : value })}>
                        <SelectTrigger id="audit-result" className="w-full">
                            <SelectValue placeholder={t('auditFilterAll')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_VALUE}>{t('auditFilterAll')}</SelectItem>
                            {AUDIT_RESULTS.map((result) => (
                                <SelectItem key={result} value={result}>
                                    {result}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-target-type">{t('auditFilterTargetType')}</Label>
                    <Select
                        value={draft.targetType || ALL_VALUE}
                        onValueChange={(value) => updateDraft({ targetType: value === ALL_VALUE ? '' : value })}
                    >
                        <SelectTrigger id="audit-target-type" className="w-full">
                            <SelectValue placeholder={t('auditFilterAll')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_VALUE}>{t('auditFilterAll')}</SelectItem>
                            {AUDIT_TARGET_TYPES.map((targetType) => (
                                <SelectItem key={targetType} value={targetType}>
                                    {targetType}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-from">{t('auditFilterFrom')}</Label>
                    <Input id="audit-from" type="date" value={draft.from} onChange={(event) => updateDraft({ from: event.target.value })} />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="audit-to">{t('auditFilterTo')}</Label>
                    <Input id="audit-to" type="date" value={draft.to} onChange={(event) => updateDraft({ to: event.target.value })} />
                </div>
                <div className="flex items-end gap-2">
                    <Button type="submit" size="sm">
                        {t('auditFilterApply')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
                        {t('auditFilterReset')}
                    </Button>
                </div>
            </form>
            {eventsQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    {SKELETON_ROWS.map((row) => (
                        <Skeleton key={row} className="h-8 w-full" />
                    ))}
                </div>
            ) : null}
            {!eventsQuery.isPending && events.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{hasFilter ? t('auditFilteredEmpty') : t('auditEmpty')}</EmptyTitle>
                        <EmptyDescription>{hasFilter ? t('auditFilteredEmptyDescription') : t('auditEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {events.length > 0 ? (
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            {COLUMN_LABEL_KEYS.map((labelKey) => (
                                <TableHead key={labelKey}>{t(labelKey)}</TableHead>
                            ))}
                            <TableHead className="text-right">{t('auditDetail')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map((event) => (
                            <AuditEventRow key={event.id} event={event} expanded={expandedIds.has(event.id)} onToggle={toggleExpanded} />
                        ))}
                    </TableBody>
                </Table>
            ) : null}
            {totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 bg-surface-2 px-4 py-3">
                    <Badge variant="neutral">{t('auditPageStatus', { page: filters.page, total, totalPages })}</Badge>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={filters.page <= 1 || eventsQuery.isFetching}
                            onClick={() => changePage(filters.page - 1)}
                        >
                            {t('auditPagePrevious')}
                        </Button>
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={filters.page >= totalPages || eventsQuery.isFetching}
                            onClick={() => changePage(filters.page + 1)}
                        >
                            {t('auditPageNext')}
                        </Button>
                    </div>
                </div>
            ) : null}
        </WidgetSection>
    )
}
