import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { interactiveExecTicketRequestSchema } from '@containers/contracts/engine-control'
import { USER_ROLE } from '@containers/db-schema/schema'
import type { EngineAgentClient } from '../../service/shared/engine-agent-client/create-engine-agent-client'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/response'
import { withErrorHandling, type ApiRouteContext } from '../../lib/with-error-handling'
import type { AuditService } from '../../service/domain/audit/create-audit-service'
import type { AuthService } from '../../service/domain/auth/create-auth-service'
import type { MaintenanceService } from '../../service/domain/maintenance/create-maintenance-service'

const { upgradeWebSocket } = createBunWebSocket()
const EXEC_ROLES = [USER_ROLE.OWNER]
const EXEC_SESSION_RECHECK_INTERVAL_MS = 15_000
const EXEC_MAX_BUFFERED_OUTPUT_BYTES = 1_048_576
const EXEC_MAX_QUEUED_INPUT_BYTES = 65_536

const containerIdParamSchema = z.object({ containerId: z.string().min(1) })

type InteractiveExecProxyRouteDependencies = {
    auditService: Pick<AuditService, 'record'>
    authService: Pick<AuthService, 'requireRole'>
    engineAgentClient: Pick<EngineAgentClient, 'createInteractiveExecTicket' | 'getInteractiveExecWebSocketUrl'>
    maintenanceService: Pick<MaintenanceService, 'isEnabled'>
}

type BufferedWebSocket = {
    getBufferedAmount: () => number
}

const hasBufferedAmount = (value: unknown): value is BufferedWebSocket =>
    typeof value === 'object' &&
    value !== null &&
    'getBufferedAmount' in value &&
    typeof (value as { getBufferedAmount?: unknown }).getBufferedAmount === 'function'

const getSourceIp = (headers: Headers) => headers.get('x-real-ip')?.trim() || undefined

export const createInteractiveExecProxyRoute = ({
    auditService,
    authService,
    engineAgentClient,
    maintenanceService,
}: InteractiveExecProxyRouteDependencies) =>
    new Hono()
        .post(
            '/containers/:containerId/exec-tickets',
            describeRoute({
                responses: { 201: { description: 'Interactive exec ticket 생성' } },
                summary: 'Interactive exec ticket 생성',
                tags: ['Control'],
            }),
            validator('param', containerIdParamSchema),
            validator('json', interactiveExecTicketRequestSchema),
            withErrorHandling(
                async (
                    context: ApiRouteContext<{
                        param: z.infer<typeof containerIdParamSchema>
                        json: z.infer<typeof interactiveExecTicketRequestSchema>
                    }>,
                ) => {
                    const containerId = context.req.valid('param').containerId
                    const session = await authService.requireRole(context.req.raw.headers, EXEC_ROLES)
                    const actorId = session.user.id
                    const input = context.req.valid('json')
                    await auditService.record({
                        actorId,
                        detail: { argumentCount: input.command.length - 1, executable: input.command[0] ?? '' },
                        operation: 'container.exec.interactive.ticket',
                        requestId: context.get('requestId'),
                        result: 'attempt',
                        sourceIp: getSourceIp(context.req.raw.headers),
                        targetId: containerId,
                        targetType: 'container',
                    })
                    try {
                        const ticket = await engineAgentClient.createInteractiveExecTicket(containerId, input)
                        await auditService.record({
                            actorId,
                            operation: 'container.exec.interactive.ticket',
                            requestId: context.get('requestId'),
                            result: 'success',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: containerId,
                            targetType: 'container',
                        })
                        return context.json(successResponse({ ...ticket, websocketPath: `/api/exec/ws/${encodeURIComponent(ticket.ticket)}` }), 201)
                    } catch (error) {
                        const code = error instanceof Error ? error.message : 'EXEC_TICKET_FAILED'
                        await auditService.record({
                            actorId,
                            detail: { code },
                            operation: 'container.exec.interactive.ticket',
                            requestId: context.get('requestId'),
                            result: 'failure',
                            sourceIp: getSourceIp(context.req.raw.headers),
                            targetId: containerId,
                            targetType: 'container',
                        })
                        throw error
                    }
                },
            ),
        )
        .get(
            '/exec/ws/:ticket',
            upgradeWebSocket(async (context) => {
                const headers = new Headers(context.req.raw.headers)
                await authService.requireRole(headers, EXEC_ROLES)
                if (maintenanceService.isEnabled()) {
                    throw createAppError('MAINTENANCE_MODE')
                }
                const ticket = context.req.param('ticket')
                if (!ticket || ticket.length < 32 || ticket.length > 256) {
                    throw createAppError('EXEC_TICKET_INVALID')
                }
                let upstream: WebSocket | undefined
                const queuedMessages: string[] = []
                let queuedBytes = 0
                let sessionCheckTimer: ReturnType<typeof setInterval> | undefined
                return {
                    onClose: () => {
                        if (sessionCheckTimer) {
                            clearInterval(sessionCheckTimer)
                        }
                        upstream?.close()
                    },
                    onMessage: (event, websocket) => {
                        const message = String(event.data)
                        if (upstream?.readyState === WebSocket.OPEN) {
                            upstream.send(message)
                        } else {
                            queuedBytes += Buffer.byteLength(message)
                            if (queuedBytes > EXEC_MAX_QUEUED_INPUT_BYTES) {
                                websocket.close(1009, 'queued input limit exceeded')
                                return
                            }
                            queuedMessages.push(message)
                        }
                    },
                    onOpen: (_event, websocket) => {
                        sessionCheckTimer = setInterval(() => {
                            void authService.requireRole(headers, EXEC_ROLES).catch(() => websocket.close(1008, 'session revoked'))
                        }, EXEC_SESSION_RECHECK_INTERVAL_MS)
                        upstream = new WebSocket(engineAgentClient.getInteractiveExecWebSocketUrl(ticket))
                        upstream.addEventListener('open', () => {
                            for (const message of queuedMessages.splice(0)) {
                                upstream?.send(message)
                            }
                            queuedBytes = 0
                        })
                        upstream.addEventListener('message', (event) => {
                            if (hasBufferedAmount(websocket.raw) && websocket.raw.getBufferedAmount() > EXEC_MAX_BUFFERED_OUTPUT_BYTES) {
                                upstream?.close()
                                websocket.close(1013, 'browser output buffer limit exceeded')
                                return
                            }
                            websocket.send(String(event.data))
                        })
                        upstream.addEventListener('close', (event) => websocket.close(event.code || 1000, event.reason))
                        upstream.addEventListener('error', () => websocket.close(1011, 'agent websocket failed'))
                    },
                }
            }),
        )
