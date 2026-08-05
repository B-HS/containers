import type { Context, Input, Next, ValidationTargets } from 'hono'
import type { HandlerResponse } from 'hono/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODE, type ErrorCode } from './error-code'
import { ERROR_MESSAGE } from './error-message'
import { getStatusCode, isAppError, resolveErrorCode } from './error'
import { errorResponse } from './response'

export type ApiEnv = { Variables: { requestId: string } }
export type ApiContext = Context<ApiEnv>

export type RouteInput<TValidated extends Partial<Record<keyof ValidationTargets, unknown>>> = { out: TValidated }

export type ApiRouteContext<TValidated extends Partial<Record<keyof ValidationTargets, unknown>> = Record<never, never>> = Context<
    ApiEnv,
    string,
    RouteInput<TValidated>
>

const INTERNAL_ERROR_MESSAGE = ERROR_MESSAGE[ERROR_CODE.INTERNAL_ERROR]

const resolveThrown = (error: unknown): { code: ErrorCode; detail: string | undefined } => {
    if (typeof error !== 'object' || error === null) {
        return { code: ERROR_CODE.INTERNAL_ERROR, detail: undefined }
    }

    const candidate = (error as Record<string, unknown>).message

    return typeof candidate === 'string' ? resolveErrorCode(candidate) : { code: ERROR_CODE.INTERNAL_ERROR, detail: undefined }
}

/**
 * Wraps a route handler so AppError instances become their mapped status code
 * response and an unexpected error becomes an INTERNAL_ERROR response.
 *
 * The result is asserted back to the handler's own return type R so Hono keeps
 * inferring the route's RPC response schema; the error branch adds a response
 * shape that R does not describe, which no sound signature can express here.
 */
export const withErrorHandling = <I extends Input, R extends HandlerResponse<unknown>>(
    handler: (context: Context<ApiEnv, string, I>, next: Next) => R,
) =>
    (async (context: Context<ApiEnv, string, I>, next: Next) => {
        try {
            return await handler(context, next)
        } catch (error) {
            const requestId = context.get('requestId')

            if (isAppError(error)) {
                console.error(`[api] request failed: code=${error.code} message=${error.message}`)
                return context.json(
                    errorResponse(error.code, ERROR_MESSAGE[error.code] ?? INTERNAL_ERROR_MESSAGE, requestId, error.details),
                    error.statusCode as ContentfulStatusCode,
                )
            }

            const { code, detail } = resolveThrown(error)
            console.error(`[api] request failed: code=${code}`, error)
            return context.json(
                errorResponse(code, ERROR_MESSAGE[code] ?? INTERNAL_ERROR_MESSAGE, requestId, detail === undefined ? undefined : { detail }),
                getStatusCode(code) as ContentfulStatusCode,
            )
        }
    }) as unknown as (context: Context<ApiEnv, string, I>, next: Next) => R
