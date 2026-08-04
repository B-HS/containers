import type { TrafficDatabase } from '../../db/database'

const BYTE_LIMIT_TARGET_RATIO = 0.9
const VACUUM_RECLAIMABLE_RATIO = 0.25

type TrafficStorageStats = ReturnType<TrafficDatabase['getStorageStats']>

type TrafficRetentionServiceDependencies = {
    database: Pick<TrafficDatabase, 'deleteBefore' | 'deleteOldest' | 'getStorageStats' | 'vacuum'>
    maxByteSize: number
    maxRowCount: number
    now: () => number
    retentionMs: number
}

export const createTrafficRetentionService = ({ database, maxByteSize, maxRowCount, now, retentionMs }: TrafficRetentionServiceDependencies) => {
    let lastRunAt: string | null = null
    let lastVacuumAt: string | null = null
    let removedByAgeCount = 0
    let removedByByteLimitCount = 0
    let removedByRowLimitCount = 0
    let vacuumCount = 0

    const usedByteSize = (stats: TrafficStorageStats) => stats.byteSize - stats.reclaimableByteSize

    const trimToByteLimit = (stats: TrafficStorageStats) => {
        const used = usedByteSize(stats)
        if (used <= maxByteSize || stats.rowCount === 0) return 0
        const keepRowCount = Math.floor((stats.rowCount * maxByteSize * BYTE_LIMIT_TARGET_RATIO) / used)
        return database.deleteOldest(stats.rowCount - keepRowCount)
    }

    const run = () => {
        const removedByAge = database.deleteBefore(now() - retentionMs)
        const afterAge = database.getStorageStats()
        const removedByRowLimit = database.deleteOldest(afterAge.rowCount - maxRowCount)
        const removedByByteLimit = trimToByteLimit(removedByRowLimit > 0 ? database.getStorageStats() : afterAge)

        removedByAgeCount += removedByAge
        removedByByteLimitCount += removedByByteLimit
        removedByRowLimitCount += removedByRowLimit
        lastRunAt = new Date(now()).toISOString()

        const stats = database.getStorageStats()
        const vacuumed = stats.byteSize > 0 && stats.reclaimableByteSize / stats.byteSize >= VACUUM_RECLAIMABLE_RATIO
        if (vacuumed) {
            database.vacuum()
            vacuumCount += 1
            lastVacuumAt = lastRunAt
        }
        return { removedByAge, removedByByteLimit, removedByRowLimit, vacuumed }
    }

    return {
        getState: () => {
            const stats = database.getStorageStats()
            return {
                byteSize: stats.byteSize,
                lastRunAt,
                lastVacuumAt,
                maxByteSize,
                maxRowCount,
                reclaimableByteSize: stats.reclaimableByteSize,
                removedByAgeCount,
                removedByByteLimitCount,
                removedByRowLimitCount,
                rowCount: stats.rowCount,
                vacuumCount,
            }
        },
        run,
        start: (intervalMs: number) => {
            const tick = () => {
                try {
                    run()
                } catch (error) {
                    console.error('traffic 보존 정리 실패:', error)
                }
            }
            tick()
            const interval = setInterval(tick, intervalMs)
            return () => clearInterval(interval)
        },
    }
}

export type TrafficRetentionService = ReturnType<typeof createTrafficRetentionService>
