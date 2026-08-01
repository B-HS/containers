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

export type Health = z.infer<typeof healthSchema>
