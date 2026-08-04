import type { Context } from 'hono'
import { createAppError } from './error'

export const withApiToken =
    (deps: { validateToken: (token: string) => Promise<boolean> }) =>
    (handler: (context: Context) => Promise<Response> | Response) =>
    async (context: Context) => {
        const token = context.req.header('Authorization')?.replace('Bearer ', '')
        if (!token || !(await deps.validateToken(token))) {
            throw createAppError('UNAUTHORIZED')
        }
        return handler(context)
    }
