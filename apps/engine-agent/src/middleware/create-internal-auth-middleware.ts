import type { MiddlewareHandler } from 'hono'
import { createInternalRequestAuthorizer, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'

type InternalAuthMiddlewareDependencies = {
    now: () => number
    secret: string
}

export const createInternalAuthMiddleware = ({ now, secret }: InternalAuthMiddlewareDependencies): MiddlewareHandler => {
    const authorize = createInternalRequestAuthorizer({ now, secret })

    return async (context, next) => {
        const timestamp = context.req.header(INTERNAL_AUTH_HEADERS.TIMESTAMP) ?? ''
        const nonce = context.req.header(INTERNAL_AUTH_HEADERS.NONCE) ?? ''
        const signature = context.req.header(INTERNAL_AUTH_HEADERS.SIGNATURE) ?? ''
        const url = new URL(context.req.url)
        const body = await context.req.raw.clone().text()
        const valid = authorize({
            body,
            method: context.req.method,
            nonce,
            path: `${url.pathname}${url.search}`,
            signature,
            timestamp,
        })

        if (!valid) {
            return context.json({ error: 'UNAUTHORIZED' }, 401)
        }

        await next()
    }
}
