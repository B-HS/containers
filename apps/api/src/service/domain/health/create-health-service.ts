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
            version: '0.1.0',
        }),
})

export type HealthService = ReturnType<typeof createHealthService>
