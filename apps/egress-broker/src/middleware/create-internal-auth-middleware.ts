import type { MiddlewareHandler } from 'hono'
import { createInternalRequestAuthorizer, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'

type InternalAuthMiddlewareDependencies = {
    now: () => number
    secret: string
}

export const createInternalAuthMiddleware = ({ now, secret }: InternalAuthMiddlewareDependencies): MiddlewareHandler => {
    const authorize = createInternalRequestAuthorizer({ now, secret })

    return async (context, next) => {
        const url = new URL(context.req.url)
        const valid = authorize({
            body: await context.req.raw.clone().text(),
            method: context.req.method,
            nonce: context.req.header(INTERNAL_AUTH_HEADERS.NONCE) ?? '',
            path: `${url.pathname}${url.search}`,
            signature: context.req.header(INTERNAL_AUTH_HEADERS.SIGNATURE) ?? '',
            timestamp: context.req.header(INTERNAL_AUTH_HEADERS.TIMESTAMP) ?? '',
        })

        if (!valid) {
            return context.json({ error: 'UNAUTHORIZED' }, 401)
        }

        await next()
    }
}
