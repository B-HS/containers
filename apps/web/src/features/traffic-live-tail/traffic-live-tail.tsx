'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import { trafficLiveEventSchema, type TrafficLiveEvent } from '@containers/contracts/traffic'
import { formatDateTime } from '@shared/lib/format-date-time'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'

type TrafficLiveTailProps = {
    createLiveStream: () => EventSource
    initialEvents: TrafficLiveEvent[]
    labels: {
        empty: string
        emptyHint: string
        latency: string
        maskedIp: string
        path: string
        pause: string
        resume: string
        status: string
    }
}

const MAX_EVENTS = 25
const LATENCY_FRACTION_DIGITS = 1

export const TrafficLiveTail: FC<TrafficLiveTailProps> = ({ createLiveStream, initialEvents, labels }) => {
    const pausedRef = useRef(false)
    const [events, setEvents] = useState(initialEvents)
    const [paused, setPaused] = useState(false)

    const togglePause = () => {
        pausedRef.current = !pausedRef.current
        setPaused(pausedRef.current)
    }

    useEffect(() => {
        const source = createLiveStream()
        source.onmessage = (message) => {
            const parsed = trafficLiveEventSchema.safeParse(
                (() => {
                    try {
                        return JSON.parse(message.data)
                    } catch {
                        return undefined
                    }
                })(),
            )
            if (!parsed.success) return
            if (pausedRef.current) return
            setEvents((current) => [parsed.data, ...current.filter((event) => event.requestId !== parsed.data.requestId)].slice(0, MAX_EVENTS))
        }
        return () => source.close()
    }, [createLiveStream])

    return (
        <div className="grid gap-2">
            <div className="flex justify-end">
                <Button onClick={togglePause} size="xs" type="button" variant="outline">
                    {paused ? labels.resume : labels.pause}
                </Button>
            </div>
            {events.length === 0 ? (
                <Empty className="py-10">
                    <EmptyHeader>
                        <EmptyTitle className="text-base">{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.emptyHint}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            <TableHead>UTC</TableHead>
                            <TableHead>{labels.status}</TableHead>
                            <TableHead>{labels.path}</TableHead>
                            <TableHead>{labels.latency}</TableHead>
                            <TableHead>{labels.maskedIp}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map((event) => (
                            <TableRow key={event.requestId} className="odd:bg-overlay-subtle">
                                <TableCell>{formatDateTime(event.occurredAt)}</TableCell>
                                <TableCell>{event.status}</TableCell>
                                <TableCell className="max-w-80 truncate font-mono">
                                    {event.method} {event.uriPath}
                                </TableCell>
                                <TableCell>{event.responseTimeMs.toFixed(LATENCY_FRACTION_DIGITS)} ms</TableCell>
                                <TableCell className="font-mono">{event.clientIpMasked}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}
