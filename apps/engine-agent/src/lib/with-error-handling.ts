import type { Context, Env, Input, Next, ValidationTargets } from 'hono'
import type { HandlerResponse } from 'hono/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODE, type ErrorCode } from './error-code'
import { getStatusCode, isAppError, STATUS_MAP } from './error'

export type AgentContext = Context

type RouteInput<TValidated extends Partial<Record<keyof ValidationTargets, unknown>>> = { out: TValidated }

export type AgentRouteContext<TValidated extends Partial<Record<keyof ValidationTargets, unknown>> = Record<never, never>> = Context<
    Env,
    string,
    RouteInput<TValidated>
>

const INTERNAL_ERROR_CODE = ERROR_CODE.INTERNAL_ERROR

const getErrorCode = (error: unknown): ErrorCode => {
    if (typeof error !== 'object' || error === null) {
        return INTERNAL_ERROR_CODE
    }

    const candidate = (error as Record<string, unknown>).message
    const code = typeof candidate === 'string' ? candidate.split(':')[0] : undefined

    return code !== undefined && code in STATUS_MAP ? (code as ErrorCode) : INTERNAL_ERROR_CODE
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
    handler: (context: Context<Env, string, I>, next: Next) => R,
) =>
    (async (context: Context<Env, string, I>, next: Next) => {
        try {
            return await handler(context, next)
        } catch (error) {
            if (isAppError(error)) {
                return context.json({ error: error.code }, error.statusCode as ContentfulStatusCode)
            }

            const code = getErrorCode(error)
            console.error(`[engine-agent] request failed: code=${code}`, error)
            return context.json({ error: code }, getStatusCode(code) as ContentfulStatusCode)
        }
    }) as unknown as (context: Context<Env, string, I>, next: Next) => R
