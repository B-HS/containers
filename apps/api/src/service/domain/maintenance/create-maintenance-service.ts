import { maintenanceStatusSchema } from '@containers/contracts/maintenance'
import { createAppError } from '../../../lib/error'

const DRAIN_POLL_INTERVAL_MS = 50

type MaintenanceRecord = {
    actorId: string | null
    jobId: string | null
    reason: string
    startedAt: Date
}

type MaintenanceServiceDb = {
    clear: (updatedAt: Date) => void
    load: () => MaintenanceRecord | null
    save: (record: MaintenanceRecord & { updatedAt: Date }) => void
}

type MaintenanceEnableContext = {
    actorId?: string | null
    jobId?: string | null
}

type MaintenanceServiceDependencies = {
    db: MaintenanceServiceDb
    now: () => Date
    sleep: (milliseconds: number) => Promise<void>
}

export type { MaintenanceEnableContext, MaintenanceRecord, MaintenanceServiceDb }

export const createMaintenanceService = ({ db, now, sleep }: MaintenanceServiceDependencies) => {
    let enabledState = db.load()
    let inflightMutations = 0

    return {
        disable: () => {
            enabledState = null
            db.clear(now())
        },
        drain: async (timeoutMs: number) => {
            const deadline = now().getTime() + timeoutMs
            while (inflightMutations > 0) {
                if (now().getTime() >= deadline) {
                    throw createAppError('MAINTENANCE_DRAIN_TIMEOUT')
                }
                await sleep(DRAIN_POLL_INTERVAL_MS)
            }
        },
        enable: (reason: string, context: MaintenanceEnableContext = {}) => {
            if (enabledState) {
                return false
            }
            const startedAt = now()
            enabledState = { actorId: context.actorId ?? null, jobId: context.jobId ?? null, reason, startedAt }
            db.save({ ...enabledState, updatedAt: startedAt })
            return true
        },
        enter: () => {
            inflightMutations += 1
        },
        getInflightMutationCount: () => inflightMutations,
        getStatus: () =>
            maintenanceStatusSchema.parse({
                actorId: enabledState?.actorId ?? null,
                enabled: enabledState !== null,
                jobId: enabledState?.jobId ?? null,
                reason: enabledState?.reason ?? null,
                startedAt: enabledState?.startedAt.toISOString() ?? null,
            }),
        isEnabled: () => enabledState !== null,
        leave: () => {
            inflightMutations = Math.max(0, inflightMutations - 1)
        },
    }
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>
