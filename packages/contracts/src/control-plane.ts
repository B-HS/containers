import { z } from 'zod'
import { maintenanceStatusSchema } from './maintenance'

export const CONTROL_PLANE_VERSION = '0.1.0'

export const controlPlaneMigrationSchema = z.object({
    appliedAt: z.iso.datetime().nullable(),
    tag: z.string().min(1),
})

export const controlPlaneStatusSchema = z.object({
    activeJobCount: z.number().int().nonnegative(),
    databaseIntegrity: z.object({
        control: z.string().min(1),
    }),
    lastBackupAt: z.iso.datetime().nullable(),
    maintenance: maintenanceStatusSchema,
    migrations: z.object({
        applied: z.array(controlPlaneMigrationSchema),
        pending: z.array(controlPlaneMigrationSchema),
    }),
    version: z.string().min(1),
})

export type ControlPlaneMigration = z.infer<typeof controlPlaneMigrationSchema>
export type ControlPlaneStatus = z.infer<typeof controlPlaneStatusSchema>
