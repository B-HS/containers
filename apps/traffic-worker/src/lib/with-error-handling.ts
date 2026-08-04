import type { Context, Handler } from 'hono'
import { ERROR_MESSAGE, isAppError } from './error'
import { errorResponse } from './response'

/**
 * Wraps a route handler so AppError instances become their mapped status code
 * response and any other error becomes an INTERNAL_ERROR (500) response.
 */
export const withErrorHandling =
    (handler: Handler): Handler =>
    async (context: Context, next) => {
        try {
            return await handler(context, next)
        } catch (error) {
            if (isAppError(error)) {
                return context.json(errorResponse(error.code, error.message), error.statusCode as 400)
            }
            console.error(error)
            return context.json(errorResponse('INTERNAL_ERROR', ERROR_MESSAGE.INTERNAL_ERROR), 500)
        }
    }
