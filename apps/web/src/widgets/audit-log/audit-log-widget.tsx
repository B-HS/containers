'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { AuditEvent } from '@containers/contracts/audit'
import { Badge } from '@shared/ui/badge'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type AuditLogWidgetProps = {
    events: AuditEvent[]
    labels: {
        actor: string
        empty: string
        filter: string
        operation: string
        result: string
        target: string
        title: string
    }
}

export const AuditLogWidget: FC<AuditLogWidgetProps> = ({ events, labels }) => {
    const [filter, setFilter] = useState('')
    const normalizedFilter = filter.trim().toLowerCase()
    const visibleEvents = normalizedFilter
        ? events.filter((event) =>
              [event.operation, event.result, event.targetType, event.targetId ?? '', event.actorEmail ?? ''].some((value) =>
                  value.toLowerCase().includes(normalizedFilter),
              ),
          )
        : events

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="audit-log-title">
            <header className="flex flex-wrap items-end justify-between gap-3 p-3">
                <div>
                    <h2 id="audit-log-title" className="text-sm font-semibold">
                        {labels.title}
                    </h2>
                    <Badge variant="muted">{visibleEvents.length}</Badge>
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="audit-filter">{labels.filter}</Label>
                    <Input id="audit-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="w-64 max-w-full" />
                </div>
            </header>
            {visibleEvents.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            {visibleEvents.length > 0 ? (
                <div className="overflow-x-auto p-3 pt-0">
                    <table className="w-full min-w-[840px] text-left text-xs">
                        <thead className="text-muted-foreground">
                            <tr>
                                <th className="p-2 font-medium">UTC</th>
                                <th className="p-2 font-medium">{labels.operation}</th>
                                <th className="p-2 font-medium">{labels.target}</th>
                                <th className="p-2 font-medium">{labels.actor}</th>
                                <th className="p-2 font-medium">{labels.result}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleEvents.map((event) => (
                                <tr key={event.id} className="border-t border-background">
                                    <td className="p-2 whitespace-nowrap">{event.createdAt.replace('T', ' ').replace('.000Z', 'Z')}</td>
                                    <td className="p-2 font-mono">{event.operation}</td>
                                    <td className="max-w-72 truncate p-2">
                                        {event.targetType} · {event.targetId ?? '—'}
                                    </td>
                                    <td className="max-w-56 truncate p-2">{event.actorEmail ?? event.actorId ?? 'system'}</td>
                                    <td className="p-2">
                                        <Badge variant="muted">{event.result}</Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </section>
    )
}
