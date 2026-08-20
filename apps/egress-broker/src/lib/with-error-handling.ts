import type { Context, Env, Input, Next, ValidationTargets } from 'hono'
import type { HandlerResponse } from 'hono/types'
import { ERROR_MESSAGE, isAppError } from './error'
import { errorResponse } from './response'

type RouteInput<TValidated extends Partial<Record<keyof ValidationTargets, unknown>>> = { out: TValidated }

export type EgressRouteContext<TValidated extends Partial<Record<keyof ValidationTargets, unknown>> = Record<never, never>> = Context<
    Env,
    string,
    RouteInput<TValidated>
>

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
                return context.json(errorResponse(error.code, error.message), error.statusCode as 400)
            }
            console.error(error)
            return context.json(errorResponse('INTERNAL_ERROR', ERROR_MESSAGE.INTERNAL_ERROR), 500)
        }
    }) as unknown as (context: Context<Env, string, I>, next: Next) => R
