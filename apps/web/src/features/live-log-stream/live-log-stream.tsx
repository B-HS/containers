'use client'

import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { containerLogStreamChunkSchema } from '@containers/contracts/engine-stream'
import { Button } from '@shared/ui/button'

const MAX_BUFFER_CHARS = 200_000

type LiveLogStreamProps = {
    containerId: string
    createLogStream: (containerId: string) => EventSource
}

export const LiveLogStream: FC<LiveLogStreamProps> = ({ containerId, createLogStream }) => {
    const outputRef = useRef<HTMLPreElement>(null)
    const sourceRef = useRef<EventSource | null>(null)
    const [buffer, setBuffer] = useState<string>()
    const [isFollowing, setIsFollowing] = useState(false)
    const t = useTranslations('Dashboard')

    const stop = () => {
        sourceRef.current?.close()
        sourceRef.current = null
        setIsFollowing(false)
    }

    const start = () => {
        sourceRef.current?.close()
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
                toast.error(t('liveLogsFailed'))
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
        <section className="grid gap-3 bg-overlay-subtle p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="text-xs font-medium text-text-strong">{t('liveLogs')}</h4>
                    <p className="mt-1 text-xs text-text-subtle">{containerId.slice(0, 12)}</p>
                </div>
                <Button type="button" size="xs" variant={isFollowing ? 'secondary' : 'outline'} onClick={() => (isFollowing ? stop() : start())}>
                    {isFollowing ? t('liveLogsStop') : t('liveLogsStart')}
                </Button>
            </div>
            {buffer !== undefined ? (
                <pre ref={outputRef} className="max-h-64 overflow-auto bg-surface-3 p-3 text-xs whitespace-pre-wrap">
                    {buffer}
                </pre>
            ) : null}
        </section>
    )
}
