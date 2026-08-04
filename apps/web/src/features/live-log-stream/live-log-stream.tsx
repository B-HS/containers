'use client'

import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { containerLogStreamChunkSchema } from '@containers/contracts/engine-stream'
import { Button } from '@shared/ui/button'

const MAX_BUFFER_CHARS = 200_000

type LiveLogStreamProps = {
    containerId: string
    createLogStream: (containerId: string) => EventSource
    labels: {
        failed: string
        start: string
        stop: string
        title: string
    }
}

export const LiveLogStream: FC<LiveLogStreamProps> = ({ containerId, createLogStream, labels }) => {
    const outputRef = useRef<HTMLPreElement>(null)
    const sourceRef = useRef<EventSource | null>(null)

    const [buffer, setBuffer] = useState<string>()
    const [isFollowing, setIsFollowing] = useState(false)
    const [error, setError] = useState<string>()

    const stop = () => {
        sourceRef.current?.close()
        sourceRef.current = null
        setIsFollowing(false)
    }

    const start = () => {
        setError(undefined)
        setBuffer('')
        setIsFollowing(true)
        const source = createLogStream(containerId)
        sourceRef.current = source
        source.onmessage = (event) => {
            let parsed: unknown
            try {
                parsed = JSON.parse(String(event.data))
            } catch {
                return
            }
            const chunk = containerLogStreamChunkSchema.safeParse(parsed)
            if (chunk.success) {
                setBuffer((current) => `${current ?? ''}${chunk.data.text}`.slice(-MAX_BUFFER_CHARS))
            }
        }
        source.onerror = () => {
            if (sourceRef.current === source) {
                setError(labels.failed)
                stop()
            }
        }
    }

    useEffect(() => {
        const output = outputRef.current
        if (output) {
            output.scrollTop = output.scrollHeight
        }
    }, [buffer])
    useEffect(() => () => sourceRef.current?.close(), [])

    return (
        <div className="grid gap-2 border-t border-background pt-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium">{labels.title}</p>
                <Button type="button" onClick={() => (isFollowing ? stop() : start())}>
                    {isFollowing ? labels.stop : labels.start}
                </Button>
            </div>
            {error ? (
                <p className="bg-red-950 p-2 text-xs text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {buffer !== undefined ? (
                <pre ref={outputRef} className="max-h-64 overflow-auto whitespace-pre-wrap bg-background p-3 text-xs">
                    {buffer}
                </pre>
            ) : null}
        </div>
    )
}
