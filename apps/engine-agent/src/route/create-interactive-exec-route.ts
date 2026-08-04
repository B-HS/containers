import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { createBunWebSocket } from 'hono/bun'
import { execTicketParamSchema, interactiveExecTicketRequestSchema } from '@containers/contracts/engine-control'
import type { InteractiveExecService } from '../service/domain/create-interactive-exec-service'
import { createInteractiveExecSession } from '../service/shared/create-interactive-exec-session'
import { withErrorHandling } from '../lib/with-error-handling'

const { upgradeWebSocket } = createBunWebSocket()
const INTERACTIVE_EXEC_IDLE_TIMEOUT_MS = 5 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_DURATION_MS = 30 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES = 1_048_576
const INTERACTIVE_EXEC_MAX_PENDING_INPUT_BYTES = 65_536

type InteractiveExecRouteDependencies = {
    interactiveExecService: InteractiveExecService
    limits?: {
        idleTimeoutMs?: number
        maxBufferedOutputBytes?: number
        maxDurationMs?: number
        maxPendingInputBytes?: number
    }
}

export const createInteractiveExecRoute = ({ interactiveExecService, limits = {} }: InteractiveExecRouteDependencies) => {
    const sessionLimits = {
        idleTimeoutMs: limits.idleTimeoutMs ?? INTERACTIVE_EXEC_IDLE_TIMEOUT_MS,
        maxBufferedOutputBytes: limits.maxBufferedOutputBytes ?? INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES,
        maxDurationMs: limits.maxDurationMs ?? INTERACTIVE_EXEC_MAX_DURATION_MS,
        maxPendingInputBytes: limits.maxPendingInputBytes ?? INTERACTIVE_EXEC_MAX_PENDING_INPUT_BYTES,
    }

    return new Hono()
        .post(
            '/v1/containers/:containerId/exec-tickets',
            describeRoute({
                tags: ['interactive-exec'],
                summary: 'interactive exec ticket 생성',
                responses: { 201: { description: 'ticket 생성' } },
            }),
            validator('json', interactiveExecTicketRequestSchema),
            withErrorHandling(async (context) =>
                context.json(interactiveExecService.createTicket(context.req.param('containerId'), context.req.valid('json' as never)), 201),
            ),
        )
        .get(
            '/ws/exec/:ticket',
            describeRoute({
                tags: ['interactive-exec'],
                summary: 'interactive exec 웹소켓 연결',
                responses: { 101: { description: '웹소켓 연결' } },
            }),
            validator('param', execTicketParamSchema),
            upgradeWebSocket((context) => {
                const { onClose, onMessage, onOpen } = createInteractiveExecSession({
                    interactiveExecService,
                    ticket: (context.req.valid('param' as never) as { ticket: string }).ticket,
                    limits: sessionLimits,
                })
                return { onClose, onMessage, onOpen }
            }),
        )
}
