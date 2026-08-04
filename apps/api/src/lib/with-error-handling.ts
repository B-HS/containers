import type { Context, Handler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODE, type ErrorCode } from './error-code'
import { ERROR_MESSAGE } from './error-message'
import { getStatusCode, isAppError, STATUS_MAP } from './error'
import { errorResponse } from './response'

export type ApiEnv = { Variables: { requestId: string } }
export type ApiContext = Context<ApiEnv>

const INTERNAL_ERROR_MESSAGE = ERROR_MESSAGE[ERROR_CODE.INTERNAL_ERROR]

const getErrorCode = (error: unknown): ErrorCode => {
    if (typeof error !== 'object' || error === null) {
        return ERROR_CODE.INTERNAL_ERROR
    }

    const candidate = (error as Record<string, unknown>).message
    const code = typeof candidate === 'string' ? candidate : undefined

    return code !== undefined && code in STATUS_MAP ? (code as ErrorCode) : ERROR_CODE.INTERNAL_ERROR
}

export const withErrorHandling =
    (handler: Handler<ApiEnv>): Handler<ApiEnv> =>
    async (context, next) => {
        try {
            return await handler(context, next)
        } catch (error) {
            const requestId = context.get('requestId')

            if (isAppError(error)) {
                console.error(`[api] request failed: code=${error.code} message=${error.message}`)
                return context.json(errorResponse(error.code, error.message, requestId), error.statusCode as ContentfulStatusCode)
            }

            const code = getErrorCode(error)
            console.error(`[api] request failed: code=${code}`, error)
            return context.json(errorResponse(code, INTERNAL_ERROR_MESSAGE, requestId), getStatusCode(code) as ContentfulStatusCode)
        }
    }
