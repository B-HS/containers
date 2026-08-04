'use client'

import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { z } from 'zod'
import { engineOverviewSchema } from '@containers/contracts/engine'

const POLL_INTERVAL_MS = 30_000
const MIB = 1_048_576

const engineResponseSchema = z.object({ data: engineOverviewSchema, success: z.literal(true) })

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
    const [cpus, setCpus] = useState<number>()
    const [memoryBytes, setMemoryBytes] = useState<number>()
    const [storage, setStorage] = useState<string>()
    const [refreshing, setRefreshing] = useState(false)
    const refreshingRef = useRef(false)

    const applyOverview = (overview: z.infer<typeof engineOverviewSchema>) => {
        setCpus(overview.cpus)
        setMemoryBytes(overview.memoryBytes)
        setStorage(`${formatBytes(overview.disk.usedBytes)} / ${formatBytes(overview.disk.capacityBytes)}`)
    }

    const fetchOverview = async () => {
        try {
            const response = await fetch('/api/system/engine')
            if (!response.ok) {
                return
            }
            applyOverview(engineResponseSchema.parse(await response.json()).data)
        } catch {
            return
        }
    }

    useEffect(() => {
        void fetchOverview()
        const pollTimer = setInterval(() => void fetchOverview(), POLL_INTERVAL_MS)
        return () => clearInterval(pollTimer)
    }, [])
    const handleRefresh = async () => {
        if (refreshingRef.current) {
            return
        }
        refreshingRef.current = true
        setRefreshing(true)
        await fetchOverview()
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
            {cpus === undefined || memoryBytes === undefined || storage === undefined ? (
                <div className="grid gap-1" aria-hidden="true">
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                    <div className="h-4 animate-pulse rounded-sm bg-muted" />
                </div>
            ) : (
                <dl className="grid gap-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.cpu}</dt>
                        <dd className="font-mono">{cpus}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.memory}</dt>
                        <dd className="font-mono">{formatBytes(memoryBytes)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{labels.storage}</dt>
                        <dd className="truncate font-mono">{storage}</dd>
                    </div>
                </dl>
            )}
        </div>
    )
}
