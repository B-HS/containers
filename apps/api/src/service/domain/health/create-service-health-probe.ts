import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'

const PROBE_TIMEOUT_MS = 3_000

type ServiceHealthProbeDependencies = {
    baseUrl: string
    fetcher?: typeof fetch
    timeoutMs?: number
}

export const createServiceHealthProbe =
    ({ baseUrl, fetcher = fetch, timeoutMs = PROBE_TIMEOUT_MS }: ServiceHealthProbeDependencies) =>
    async () => {
        try {
            const response = await fetcher(new URL('/health', baseUrl), { signal: AbortSignal.timeout(timeoutMs) })
            if (!response.ok) {
                return SERVICE_STATUS.DEGRADED
            }
            const health = healthSchema.safeParse(await response.json())
            return health.success && health.data.status === SERVICE_STATUS.OK ? SERVICE_STATUS.OK : SERVICE_STATUS.DEGRADED
        } catch {
            return SERVICE_STATUS.DEGRADED
        }
    }
