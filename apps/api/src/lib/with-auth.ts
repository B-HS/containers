import type { Handler } from 'hono'
import { createAppError } from './error'
import type { ApiContext, ApiEnv } from './with-error-handling'

export const withAuth =
    <TSession extends { user: Record<string, unknown> }>({ getSession }: { getSession: (headers: Headers) => Promise<TSession | undefined> }) =>
    (handler: (context: ApiContext, user: TSession['user']) => Response | Promise<Response>): Handler<ApiEnv> => {
        return async (context) => {
            const session = await getSession(context.req.raw.headers)

            if (!session) {
                throw createAppError('AUTH_REQUIRED')
            }

            return handler(context, session.user)
        }
    }

export const withAdmin =
    <TSession extends { role: string; user: Record<string, unknown> }>({
        getSession,
    }: {
        getSession: (headers: Headers) => Promise<TSession | undefined>
    }) =>
    (handler: (context: ApiContext, user: TSession['user']) => Response | Promise<Response>): Handler<ApiEnv> => {
        return async (context) => {
            const session = await getSession(context.req.raw.headers)

            if (!session) {
                throw createAppError('AUTH_REQUIRED')
            }

            if (session.role !== 'owner' && session.role !== 'admin') {
                throw createAppError('FORBIDDEN')
            }

            return handler(context, session.user)
        }
    }

export const withApiToken =
    <TPrincipal>({ validateToken }: { validateToken: (token: string) => Promise<TPrincipal> }) =>
    (handler: (context: ApiContext, principal: TPrincipal) => Response | Promise<Response>): Handler<ApiEnv> => {
        return async (context) => {
            const authorization = context.req.header('authorization')

            if (!authorization?.startsWith('Bearer ')) {
                throw createAppError('AUTH_REQUIRED')
            }

            const principal = await validateToken(authorization.slice('Bearer '.length))
            return handler(context, principal)
        }
    }
