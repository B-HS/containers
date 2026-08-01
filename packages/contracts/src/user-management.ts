import { z } from 'zod'

export const managedUserRoleSchema = z.enum(['admin', 'auditor', 'operator', 'owner', 'viewer'])
export const assignableUserRoleSchema = z.enum(['admin', 'auditor', 'operator', 'viewer'])

export const managedUserSchema = z.object({
    createdAt: z.iso.datetime(),
    disabledAt: z.iso.datetime().nullable(),
    email: z.email(),
    id: z.string().min(1),
    name: z.string().min(1),
    role: managedUserRoleSchema,
    updatedAt: z.iso.datetime(),
})

export const managedUserListSchema = z.array(managedUserSchema)

export const managedUserUpdateSchema = z
    .object({
        disabled: z.boolean().optional(),
        role: assignableUserRoleSchema.optional(),
    })
    .refine((input) => input.disabled !== undefined || input.role !== undefined, { message: '변경할 사용자 속성이 필요합니다.' })

export type ManagedUser = z.infer<typeof managedUserSchema>
