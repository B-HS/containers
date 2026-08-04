'use client'

import type { FC } from 'react'
import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetEngineOverview } from '@entities/engine/engine.query'

const MIB = 1_048_576

const formatBytes = (bytes: number) => `${(bytes / MIB).toFixed(0)} MiB`

type EngineInfoProps = {
    labels: {
        cpu: string
        engine: string
        memory: string
        refresh: string
        storage: string
    }
}

export const EngineInfo: FC<EngineInfoProps> = ({ labels }) => {
    const { data, refetch } = useGetEngineOverview()
    const [refreshing, setRefreshing] = useState(false)
    const refreshingRef = useRef(false)

    const handleRefresh = async () => {
        if (refreshingRef.current) {
            return
        }
        refreshingRef.current = true
        setRefreshing(true)
        await refetch()
        refreshingRef.current = false
        setRefreshing(false)
    }

    return (
        <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{labels.engine}</p>
                <button
                    aria-label={labels.refresh}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => void handleRefresh()}
                    type="button"
                >
                    <RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>
            {data === undefined ? (
                <div className="grid gap-1" aria-hidden="true">
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                </div>
            ) : (
                <dl className="grid gap-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.cpu}</dt>
                        <dd className="font-mono">{data.cpus}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.memory}</dt>
                        <dd className="font-mono">{formatBytes(data.memoryBytes)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.storage}</dt>
                        <dd className="truncate font-mono">
                            {formatBytes(data.disk.usedBytes)} / {formatBytes(data.disk.capacityBytes)}
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    )
}
