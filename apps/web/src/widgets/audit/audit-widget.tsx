'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AuditEvent } from '@containers/contracts/audit'
import { useGetAuditEvents } from '@entities/audit/audit.query'
import { AuditEventRow } from '@features/audit-event-row/audit-event-row'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'

const SORT_VALUE = {
    actor: (event: AuditEvent) => event.actorEmail ?? event.actorId ?? 'system',
    createdAt: (event: AuditEvent) => event.createdAt,
    operation: (event: AuditEvent) => event.operation,
    result: (event: AuditEvent) => event.result,
    target: (event: AuditEvent) => `${event.targetType} ${event.targetId ?? ''}`,
} as const

type SortColumn = keyof typeof SORT_VALUE

const SORT_COLUMNS = [
    { column: 'createdAt', labelKey: 'auditTime' },
    { column: 'operation', labelKey: 'auditOperation' },
    { column: 'target', labelKey: 'auditTarget' },
    { column: 'actor', labelKey: 'auditActor' },
    { column: 'result', labelKey: 'auditResult' },
] as const

const ariaSort = (active: boolean, ascending: boolean) => {
    if (!active) {
        return 'none'
    }
    return ascending ? 'ascending' : 'descending'
}

export const AuditWidget: FC = () => {
    const [ascending, setAscending] = useState(false)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
    const [filter, setFilter] = useState('')
    const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt')
    const t = useTranslations('Dashboard')
    const eventsQuery = useGetAuditEvents()
    const events = eventsQuery.data ?? []
    const normalizedFilter = filter.trim().toLowerCase()
    const matchedEvents = events.filter((event) =>
        [event.operation, event.result, event.targetType, event.targetId ?? '', event.actorEmail ?? ''].some((value) =>
            value.toLowerCase().includes(normalizedFilter),
        ),
    )
    const visibleEvents = [...matchedEvents].sort(
        (left, right) => SORT_VALUE[sortColumn](left).localeCompare(SORT_VALUE[sortColumn](right)) * (ascending ? 1 : -1),
    )

    const changeSort = (column: SortColumn) => {
        setAscending(column === sortColumn ? !ascending : false)
        setSortColumn(column)
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
        <WidgetSection
            id="audit-log-title"
            title={t('auditLog')}
            badge={visibleEvents.length}
            header={
                <div className="grid gap-2">
                    <Label htmlFor="audit-filter">{t('auditFilter')}</Label>
                    <Input id="audit-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="w-64 max-w-full" />
                </div>
            }
        >
            {eventsQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            ) : null}
            {!eventsQuery.isPending && events.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('auditEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('auditEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {!eventsQuery.isPending && events.length > 0 && visibleEvents.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('auditFilteredEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('auditFilteredEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {visibleEvents.length > 0 ? (
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            {SORT_COLUMNS.map((item) => (
                                <TableHead key={item.column} aria-sort={ariaSort(item.column === sortColumn, ascending)}>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 hover:text-text-strong"
                                        onClick={() => changeSort(item.column)}
                                    >
                                        {t(item.labelKey)}
                                        {item.column === sortColumn ? (
                                            <span aria-hidden="true">
                                                {ascending ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
                                            </span>
                                        ) : null}
                                    </button>
                                </TableHead>
                            ))}
                            <TableHead className="text-right">{t('auditDetail')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleEvents.map((event) => (
                            <AuditEventRow key={event.id} event={event} expanded={expandedIds.has(event.id)} onToggle={toggleExpanded} />
                        ))}
                    </TableBody>
                </Table>
            ) : null}
        </WidgetSection>
    )
}
