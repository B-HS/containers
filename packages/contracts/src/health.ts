import { z } from 'zod'

export const SERVICE_STATUS = {
    DEGRADED: 'degraded',
    OK: 'ok',
} as const

export const serviceStatusSchema = z.enum([SERVICE_STATUS.OK, SERVICE_STATUS.DEGRADED])

export const healthSchema = z.object({
    service: z.string().min(1),
    status: serviceStatusSchema,
    timestamp: z.iso.datetime(),
    version: z.string().min(1),
})

export const READINESS_CHECK_NAME = {
    BACKUP: 'backup',
    CONTROL_DATABASE: 'controlDatabase',
    ENGINE_AGENT: 'engineAgent',
    JOBS: 'jobs',
    MAINTENANCE: 'maintenance',
    TRAFFIC_WORKER: 'trafficWorker',
} as const

export const readinessSchema = z.object({
    checks: z.object({
        backup: z.object({
            ageSeconds: z.number().int().nonnegative().nullable(),
            lastSuccessAt: z.iso.datetime().nullable(),
            status: serviceStatusSchema,
            thresholdSeconds: z.number().int().positive(),
        }),
        controlDatabase: z.object({
            integrity: z.string().min(1),
            status: serviceStatusSchema,
        }),
        engineAgent: z.object({
            status: serviceStatusSchema,
        }),
        jobs: z.object({
            active: z.number().int().nonnegative(),
            stalled: z.number().int().nonnegative(),
            status: serviceStatusSchema,
        }),
        maintenance: z.object({
            enabled: z.boolean(),
            status: serviceStatusSchema,
        }),
        trafficWorker: z.object({
            status: serviceStatusSchema,
        }),
    }),
    service: z.string().min(1),
    status: serviceStatusSchema,
    timestamp: z.iso.datetime(),
    version: z.string().min(1),
})

export const readinessSummarySchema = z.object({
    checks: z.record(z.string(), serviceStatusSchema),
    service: z.string().min(1),
    status: serviceStatusSchema,
    timestamp: z.iso.datetime(),
})

export type Health = z.infer<typeof healthSchema>
export type Readiness = z.infer<typeof readinessSchema>
export type ReadinessCheckName = (typeof READINESS_CHECK_NAME)[keyof typeof READINESS_CHECK_NAME]
export type ReadinessSummary = z.infer<typeof readinessSummarySchema>
export type ServiceStatus = z.infer<typeof serviceStatusSchema>
