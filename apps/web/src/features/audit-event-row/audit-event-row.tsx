'use client'

import type { FC } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AuditEvent } from '@containers/contracts/audit'
import { Badge } from '@shared/ui/badge'
import { TableCell, TableRow } from '@shared/ui/table'
import { formatDateTime } from '@shared/lib/format-date-time'

const RESULT_VARIANT = {
    attempt: 'attention',
    failure: 'danger',
    success: 'neutral',
} as const

type AuditEventRowProps = {
    event: AuditEvent
    expanded: boolean
    onToggle: (id: string) => void
}

export const AuditEventRow: FC<AuditEventRowProps> = ({ event, expanded, onToggle }) => {
    const t = useTranslations('Dashboard')

    return (
        <>
            <TableRow className="odd:bg-overlay-subtle">
                <TableCell className="text-text-muted">{formatDateTime(event.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs text-text-strong">{event.operation}</TableCell>
                <TableCell className="max-w-72 truncate">
                    {event.targetType} · {event.targetId ?? '—'}
                </TableCell>
                <TableCell className="max-w-56 truncate">{event.actorEmail ?? event.actorId ?? 'system'}</TableCell>
                <TableCell>
                    <Badge variant={RESULT_VARIANT[event.result]}>{event.result}</Badge>
                </TableCell>
                <TableCell className="text-right">
                    <button
                        type="button"
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:bg-overlay-hover"
                        onClick={() => onToggle(event.id)}
                    >
                        {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
                        {t('auditDetail')}
                    </button>
                </TableCell>
            </TableRow>
            {expanded ? (
                <TableRow className="bg-surface-3">
                    <TableCell colSpan={6} className="whitespace-normal">
                        <dl className="grid gap-2 py-1 text-xs sm:grid-cols-3">
                            <div className="min-w-0">
                                <dt className="text-text-subtle">{t('auditRequestId')}</dt>
                                <dd className="font-mono break-all text-text-muted">{event.requestId}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-text-subtle">{t('auditAuthMethod')}</dt>
                                <dd className="font-mono break-all text-text-muted">{event.authMethod}</dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-text-subtle">{t('auditSourceIp')}</dt>
                                <dd className="font-mono break-all text-text-muted">{event.sourceIpMasked ?? '—'}</dd>
                            </div>
                            {event.detail ? (
                                <div className="min-w-0 sm:col-span-3">
                                    <dt className="text-text-subtle">{t('auditDetail')}</dt>
                                    <dd>
                                        <pre className="mt-1 overflow-x-auto bg-surface-1 p-3 font-mono text-xs text-text-muted">
                                            {JSON.stringify(event.detail, null, 2)}
                                        </pre>
                                    </dd>
                                </div>
                            ) : null}
                        </dl>
                    </TableCell>
                </TableRow>
            ) : null}
        </>
    )
}
