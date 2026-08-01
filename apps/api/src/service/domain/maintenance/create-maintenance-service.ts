import { maintenanceStatusSchema } from '@containers/contracts/maintenance'
import { createAppError } from '../../../lib/app-error'

const DRAIN_POLL_INTERVAL_MS = 50

type MaintenanceServiceDependencies = {
    now: () => Date
    sleep: (milliseconds: number) => Promise<void>
}

export const createMaintenanceService = ({ now, sleep }: MaintenanceServiceDependencies) => {
    let enabledState: { reason: string; startedAt: Date } | null = null
    let inflightMutations = 0

    return {
        disable: () => {
            enabledState = null
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
        enable: (reason: string) => {
            if (enabledState) {
                return false
            }
            enabledState = { reason, startedAt: now() }
            return true
        },
        enter: () => {
            inflightMutations += 1
        },
        getInflightMutationCount: () => inflightMutations,
        getStatus: () =>
            maintenanceStatusSchema.parse({
                enabled: enabledState !== null,
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
