import type { Context, Handler } from 'hono'
import { createAppError } from './error'

/**
 * Wraps a handler so requests without a valid API token are rejected with UNAUTHORIZED.
 */
export const withApiToken =
    (deps: { validateToken: (token: string) => Promise<boolean> }) =>
    (handler: Handler): Handler =>
    async (context: Context, next) => {
        const token = context.req.header('Authorization')?.replace('Bearer ', '')
        if (!token || !(await deps.validateToken(token))) throw createAppError('UNAUTHORIZED')
        return handler(context, next)
    }
