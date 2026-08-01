import { z } from 'zod'

const apiErrorSchema = z
    .union([z.object({ error: z.object({ message: z.string() }) }), z.object({ message: z.string() })])
    .transform((value) => ('error' in value ? value.error.message : value.message))

export const parseApiError = (input: unknown, fallback: string) => {
    const parsedError = apiErrorSchema.safeParse(input)
    return parsedError.success ? parsedError.data : fallback
}
