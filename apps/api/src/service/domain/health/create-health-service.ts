import { CONTROL_PLANE_VERSION } from '@containers/contracts/control-plane'
import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'

type HealthServiceDependencies = {
    now: () => Date
}

export const createHealthService = ({ now }: HealthServiceDependencies) => ({
    getHealth: () =>
        healthSchema.parse({
            service: 'api',
            status: SERVICE_STATUS.OK,
            timestamp: now().toISOString(),
            version: CONTROL_PLANE_VERSION,
        }),
})

export type HealthService = ReturnType<typeof createHealthService>
