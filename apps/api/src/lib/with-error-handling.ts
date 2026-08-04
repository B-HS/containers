import type { Context, Env, Handler, Input } from 'hono'
import type { HandlerResponse } from 'hono/types'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC 타입 보존을 위한 hono Handler 제네릭 기본값
export const withErrorHandling = <E extends Env = any, P extends string = any, I extends Input = any, R extends HandlerResponse<any> = any>(
    handler: Handler<E, P, I, R>,
): Handler<E, P, I, R> => {
    const wrapped = async (context: Context<E, P, I>, next: Parameters<Handler<E, P, I, R>>[1]): Promise<R> => {
        try {
            return await handler(context, next)
        } catch (error) {
            const requestId = context.get('requestId')

            if (isAppError(error)) {
                console.error(`[api] request failed: code=${error.code} message=${error.message}`)
                return context.json(
                    errorResponse(error.code, ERROR_MESSAGE[error.code] ?? error.message, requestId),
                    error.statusCode as ContentfulStatusCode,
                ) as unknown as R
            }

            const code = getErrorCode(error)
            console.error(`[api] request failed: code=${code}`, error)
            return context.json(
                errorResponse(code, ERROR_MESSAGE[code] ?? INTERNAL_ERROR_MESSAGE, requestId),
                getStatusCode(code) as ContentfulStatusCode,
            ) as unknown as R
        }
    }
    return wrapped as unknown as Handler<E, P, I, R>
}
