import { z } from 'zod'

export const USER_ROLE = {
    ADMIN: 'admin',
    AUDITOR: 'auditor',
    OPERATOR: 'operator',
    OWNER: 'owner',
    VIEWER: 'viewer',
} as const

export const USER_ROLE_VALUES = [USER_ROLE.ADMIN, USER_ROLE.AUDITOR, USER_ROLE.OPERATOR, USER_ROLE.OWNER, USER_ROLE.VIEWER] as const
export const ASSIGNABLE_USER_ROLE_VALUES = [USER_ROLE.ADMIN, USER_ROLE.AUDITOR, USER_ROLE.OPERATOR, USER_ROLE.VIEWER] as const

export const managedUserRoleSchema = z.enum(USER_ROLE_VALUES)
export const assignableUserRoleSchema = z.enum(ASSIGNABLE_USER_ROLE_VALUES)

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
