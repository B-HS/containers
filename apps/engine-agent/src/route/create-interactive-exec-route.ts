import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { createBunWebSocket } from 'hono/bun'
import { z } from 'zod'
import { execTicketParamSchema, interactiveExecTicketRequestSchema } from '@containers/contracts/engine-control'
import type { InteractiveExecService } from '../service/domain/create-interactive-exec-service'
import { createInteractiveExecSession } from '../service/shared/create-interactive-exec-session'
import { withErrorHandling, type AgentRouteContext } from '../lib/with-error-handling'

const { upgradeWebSocket } = createBunWebSocket()
const INTERACTIVE_EXEC_HANDSHAKE_TIMEOUT_MS = 30 * 1_000
const INTERACTIVE_EXEC_IDLE_TIMEOUT_MS = 5 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_DURATION_MS = 30 * 60 * 1_000
const INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES = 1_048_576
const INTERACTIVE_EXEC_MAX_PENDING_INPUT_BYTES = 65_536

type InteractiveExecRouteDependencies = {
    interactiveExecService: InteractiveExecService
    limits?: {
        handshakeTimeoutMs?: number
        idleTimeoutMs?: number
        maxBufferedOutputBytes?: number
        maxDurationMs?: number
        maxPendingInputBytes?: number
    }
}

export const createInteractiveExecRoute = ({ interactiveExecService, limits = {} }: InteractiveExecRouteDependencies) => {
    const sessionLimits = {
        handshakeTimeoutMs: limits.handshakeTimeoutMs ?? INTERACTIVE_EXEC_HANDSHAKE_TIMEOUT_MS,
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
            withErrorHandling(async (context: AgentRouteContext<{ json: z.infer<typeof interactiveExecTicketRequestSchema> }>) =>
                context.json(interactiveExecService.createTicket(context.req.param('containerId'), context.req.valid('json')), 201),
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
                    ticket: execTicketParamSchema.parse(context.req.param()).ticket,
                    limits: sessionLimits,
                })
                return { onClose, onMessage, onOpen }
            }),
        )
}
