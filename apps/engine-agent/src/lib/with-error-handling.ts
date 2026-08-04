import type { Context } from 'hono'
import { isAppError, ERROR_MESSAGE, ERROR_CODE } from './error'
import { errorResponse } from './response'

export const withErrorHandling = (handler: (context: Context) => Promise<Response> | Response) => async (context: Context) => {
    try {
        return await handler(context)
    } catch (error) {
        if (isAppError(error)) {
            return context.json(errorResponse(error.code, error.message), error.statusCode as 400)
        }
        console.error(error)
        return context.json(errorResponse(ERROR_CODE.INTERNAL_ERROR, ERROR_MESSAGE.INTERNAL_ERROR), 500)
    }
}
