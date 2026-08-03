import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { interactiveExecTicketRequestSchema, interactiveExecTicketSchema } from '@containers/contracts/engine-control'
import type { DockerEngineClient } from '../docker/create-docker-engine-client'
import { createAppError } from '../lib/app-error'

type InteractiveExecServiceDependencies = {
    dockerEngineClient: Pick<DockerEngineClient, 'createInteractiveExec' | 'getContainers' | 'inspectInteractiveExec' | 'resizeInteractiveExec'>
    now: () => Date
}

export const MAX_ACTIVE_INTERACTIVE_EXEC_SESSIONS = 10

const containerIdSchema = z.string().min(1).max(256)

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const MANAGEMENT_LABEL = 'managed-by'
const MANAGEMENT_LABEL_VALUE = 'containers-control-plane'
const MANAGEMENT_PROJECT = 'containers'

const isManagementPlaneResource = (labels: Record<string, string>) =>
    labels[COMPOSE_PROJECT_LABEL] === MANAGEMENT_PROJECT || labels[MANAGEMENT_LABEL] === MANAGEMENT_LABEL_VALUE

export const createInteractiveExecService = ({ dockerEngineClient, now }: InteractiveExecServiceDependencies) => {
    const tickets = new Map<
        string,
        {
            containerId: string
            expiresAt: Date
            input: ReturnType<typeof interactiveExecTicketRequestSchema.parse>
        }
    >()
    const activeSessions = new Set<string>()
    const inspectUntilExited = async (execId: string, attempt = 0): Promise<number> => {
        const exitCode = await dockerEngineClient.inspectInteractiveExec(execId)
        if (exitCode >= 0 || attempt >= 9) {
            return exitCode
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
        return inspectUntilExited(execId, attempt + 1)
    }

    return {
        attach: async (containerId: string, input: ReturnType<typeof interactiveExecTicketRequestSchema.parse>) =>
            dockerEngineClient.createInteractiveExec(containerId, input),
        createTicket: async (containerIdInput: unknown, input: unknown) => {
            const containerId = containerIdSchema.parse(containerIdInput)
            const containers = await dockerEngineClient.getContainers()
            const container = containers.find(
                (candidate) =>
                    candidate.Id === containerId ||
                    candidate.Id.startsWith(containerId) ||
                    candidate.Names.map((name) => name.replace(/^\//, '')).includes(containerId),
            )
            if (container && isManagementPlaneResource(container.Labels)) {
                throw createAppError('MANAGEMENT_RESOURCE_PROTECTED')
            }
            const payload = interactiveExecTicketRequestSchema.parse(input)
            const ticket = randomBytes(32).toString('base64url')
            const expiresAt = new Date(now().getTime() + 30_000)
            tickets.set(ticket, { containerId, expiresAt, input: payload })
            return interactiveExecTicketSchema.parse({ expiresAt: expiresAt.toISOString(), ticket })
        },
        consumeTicket: (ticket: string) => {
            const record = tickets.get(ticket)
            tickets.delete(ticket)
            if (!record || record.expiresAt <= now()) {
                throw createAppError('EXEC_TICKET_INVALID')
            }
            if (activeSessions.size >= MAX_ACTIVE_INTERACTIVE_EXEC_SESSIONS) {
                throw createAppError('EXEC_SESSION_LIMIT_REACHED')
            }
            const sessionId = randomBytes(16).toString('base64url')
            activeSessions.add(sessionId)
            return { ...record, sessionId }
        },
        finish: inspectUntilExited,
        releaseSession: (sessionId: string) => activeSessions.delete(sessionId),
        resize: async (execId: string, rows: number, columns: number) => dockerEngineClient.resizeInteractiveExec(execId, rows, columns),
    }
}

export type InteractiveExecService = ReturnType<typeof createInteractiveExecService>
