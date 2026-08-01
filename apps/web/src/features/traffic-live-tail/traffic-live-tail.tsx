'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import { trafficLiveEventSchema, type TrafficLiveEvent } from '@containers/contracts/traffic'
import { Button } from '@shared/ui/button'

type TrafficLiveTailProps = {
    initialEvents: TrafficLiveEvent[]
    labels: {
        latency: string
        maskedIp: string
        path: string
        pause: string
        resume: string
        status: string
    }
}

const MAX_EVENTS = 25

export const TrafficLiveTail: FC<TrafficLiveTailProps> = ({ initialEvents, labels }) => {
    const [events, setEvents] = useState(initialEvents)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)

    useEffect(() => {
        const source = new EventSource('/api/traffic/live?statusClass=all')
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
    }, [])

    return (
        <div>
            <div className="mb-2 flex justify-end">
                <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                        pausedRef.current = !pausedRef.current
                        setPaused(pausedRef.current)
                    }}
                    type="button"
                >
                    {paused ? labels.resume : labels.pause}
                </Button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="p-2 font-medium">UTC</th>
                            <th className="p-2 font-medium">{labels.status}</th>
                            <th className="p-2 font-medium">{labels.path}</th>
                            <th className="p-2 font-medium">{labels.latency}</th>
                            <th className="p-2 font-medium">{labels.maskedIp}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => (
                            <tr key={event.requestId} className="border-t border-background">
                                <td className="p-2 whitespace-nowrap">{event.occurredAt.replace('T', ' ').replace('.000Z', 'Z')}</td>
                                <td className="p-2">{event.status}</td>
                                <td className="max-w-80 truncate p-2 font-mono">
                                    {event.method} {event.uriPath}
                                </td>
                                <td className="p-2 whitespace-nowrap">{event.responseTimeMs.toFixed(1)} ms</td>
                                <td className="p-2 font-mono whitespace-nowrap">{event.clientIpMasked}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
