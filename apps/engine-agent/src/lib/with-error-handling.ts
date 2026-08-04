import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODE, type ErrorCode } from './error-code'
import { getStatusCode, isAppError, STATUS_MAP } from './error'

export type AgentContext = Context

const INTERNAL_ERROR_CODE = ERROR_CODE.INTERNAL_ERROR

const getErrorCode = (error: unknown): ErrorCode => {
    if (typeof error !== 'object' || error === null) {
        return INTERNAL_ERROR_CODE
    }

    const candidate = (error as Record<string, unknown>).message
    const code = typeof candidate === 'string' ? candidate.split(':')[0] : undefined

    return code !== undefined && code in STATUS_MAP ? (code as ErrorCode) : INTERNAL_ERROR_CODE
}

export const withErrorHandling =
    <TContext extends Context = Context>(handler: (context: TContext) => Promise<Response> | Response) =>
    async (context: TContext): Promise<Response> => {
        try {
            return await handler(context)
        } catch (error) {
            if (isAppError(error)) {
                return context.json({ error: error.code }, error.statusCode as ContentfulStatusCode)
            }

            const code = getErrorCode(error)
            console.error(`[engine-agent] request failed: code=${code}`, error)
            return context.json({ error: code }, getStatusCode(code) as ContentfulStatusCode)
        }
    }
