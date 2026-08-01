import { z } from 'zod'

export const registryServerAddressSchema = z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?$/)
    .refine((value) => !value.includes('..'))
    .refine((value) => {
        const port = value.match(/:([0-9]+)$/)?.[1]
        return port === undefined || Number(port) <= 65_535
    })

export const registryCredentialSchema = z.object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    name: z.string().min(1).max(100),
    serverAddress: registryServerAddressSchema,
    updatedAt: z.iso.datetime(),
    username: z.string().min(1).max(256),
    version: z.number().int().positive(),
})

export const registryCredentialListSchema = z.array(registryCredentialSchema)

export const registryCredentialUpsertSchema = z.object({
    name: z.string().min(1).max(100),
    password: z.string().min(1).max(4096),
    serverAddress: registryServerAddressSchema,
    username: z.string().min(1).max(256),
})

export const registryCredentialDeleteSchema = z.object({ confirmation: z.string().min(1).max(100) })

export type RegistryCredential = z.infer<typeof registryCredentialSchema>
export type RegistryCredentialUpsert = z.infer<typeof registryCredentialUpsertSchema>
