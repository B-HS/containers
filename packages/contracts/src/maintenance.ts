import { z } from 'zod'

export const maintenanceStatusSchema = z.object({
    enabled: z.boolean(),
    reason: z.string().nullable(),
    startedAt: z.iso.datetime().nullable(),
})

export const maintenanceUpdateSchema = z.object({
    enabled: z.boolean(),
    reason: z.string().trim().min(1).max(200).optional(),
})

export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>
