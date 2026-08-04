'use client'

import type { FC } from 'react'
import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetEngineOverview } from '@entities/engine/engine.query'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'

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
                <p className="text-xs font-medium text-text-muted">{labels.engine}</p>
                <button
                    aria-label={labels.refresh}
                    className="text-text-subtle transition-colors hover:text-text-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={() => void handleRefresh()}
                    type="button"
                >
                    <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} aria-hidden="true" />
                </button>
            </div>
            {data === undefined ? (
                <div className="grid gap-1" aria-hidden="true">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            ) : (
                <dl className="grid gap-1 text-xs tabular-nums">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-text-subtle">{labels.cpu}</dt>
                        <dd className="font-mono">{data.cpus}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-text-subtle">{labels.memory}</dt>
                        <dd className="font-mono">{formatBytes(data.memoryBytes)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-text-subtle">{labels.storage}</dt>
                        <dd className="truncate font-mono">
                            {formatBytes(data.disk.usedBytes)} / {formatBytes(data.disk.capacityBytes)}
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    )
}
