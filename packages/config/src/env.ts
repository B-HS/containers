import type { z } from 'zod'

export const parseEnv = <TSchema extends z.ZodType>(schema: TSchema, input: Record<string, string | undefined> = process.env) => schema.parse(input)
