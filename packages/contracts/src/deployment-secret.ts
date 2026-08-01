import { z } from 'zod'

export const deploymentSecretReferenceSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/)

export const deploymentSecretBindingSchema = z.object({
    environmentKey: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),
    reference: deploymentSecretReferenceSchema,
})

export const deploymentSecretUpsertSchema = z.object({
    reference: deploymentSecretReferenceSchema,
    value: z
        .string()
        .min(1)
        .max(4_096)
        .refine((value) => !value.includes('\0') && !value.includes('\n') && !value.includes('\r')),
})

export const deploymentSecretSchema = z.object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    reference: deploymentSecretReferenceSchema,
    updatedAt: z.iso.datetime(),
    version: z.number().int().positive(),
})

export const deploymentSecretListSchema = z.array(deploymentSecretSchema)
export const deploymentSecretDeleteSchema = z.object({ confirmation: deploymentSecretReferenceSchema })

export type DeploymentSecretBinding = z.infer<typeof deploymentSecretBindingSchema>
