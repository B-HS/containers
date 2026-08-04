import { randomUUID } from 'node:crypto'
import {
    containerDetailSchema,
    containerLogRequestSchema,
    containerLogResultSchema,
    containerSummaryListSchema,
    engineOverviewSchema,
} from '@containers/contracts/engine'
import {
    buildCachePruneRequestSchema,
    buildCachePruneResultSchema,
    containerActionSchema,
    containerChangeListSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    containerExecResultSchema,
    containerHealthProbeRequestSchema,
    containerHealthProbeResultSchema,
    containerNetworkAttachmentSchema,
    containerTopResultSchema,
    containerWaitRequestSchema,
    containerWaitResultSchema,
    dockerResourceRemoveRequestSchema,
    imagePullRequestSchema,
    imagePullResultSchema,
    imageRemoveRequestSchema,
    imageRemovalImpactSchema,
    imageSummaryListSchema,
    imageTagRequestSchema,
    interactiveExecTicketRequestSchema,
    interactiveExecTicketSchema,
    networkCreateRequestSchema,
    networkSummaryListSchema,
    operationResultSchema,
    prunePreviewRequestSchema,
    prunePreviewSchema,
    volumeSummaryListSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import { createInternalRequestSignature, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'
import { nginxConfigApplyResultSchema, nginxConfigApplySchema, nginxConfigStateSchema } from '@containers/contracts/nginx'
import {
    registryCredentialDeleteSchema,
    registryCredentialListSchema,
    registryCredentialSchema,
    registryCredentialUpsertSchema,
} from '@containers/contracts/registry-credential'
import { imageLoadRequestSchema, imageLoadResultSchema } from '@containers/contracts/upload'
import { z } from 'zod'
import { createAppError } from '../lib/error'

const AGENT_REQUEST_TIMEOUT_MS = 8_000
const AGENT_IMAGE_PULL_TIMEOUT_MS = 30 * 60 * 1_000

type EngineAgentClientDependencies = {
    baseUrl: string
    fetcher?: typeof fetch
    secret: string
}

const parseAgentError = (body: string) => {
    try {
        const result = z.object({ error: z.string().min(1) }).safeParse(JSON.parse(body))
        return result.success ? result.data.error : undefined
    } catch {
        return undefined
    }
}

export const createEngineAgentClient = ({ baseUrl, fetcher = fetch, secret }: EngineAgentClientDependencies) => {
    const requestJson = async <TSchema extends z.ZodType>(
        path: string,
        method: 'DELETE' | 'GET' | 'POST',
        schema: TSchema,
        input?: unknown,
        timeoutMs = AGENT_REQUEST_TIMEOUT_MS,
    ) => {
        const body = input === undefined ? '' : JSON.stringify(input)
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body, method, nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            ...(body.length > 0 ? { body } : {}),
            headers: {
                ...(body.length > 0 ? { 'content-type': 'application/json' } : {}),
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            method,
            signal: AbortSignal.timeout(timeoutMs),
        })

        if (!response.ok) {
            const responseBody = await response.text()
            throw createAppError(parseAgentError(responseBody) ?? `ENGINE_AGENT_${response.status}`)
        }

        return schema.parse(await response.json())
    }

    const openStream = async (path: string, signal: AbortSignal) => {
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body: '', method: 'GET', nonce, path, secret, timestamp })
        const response = await fetcher(`${baseUrl}${path}`, {
            headers: {
                [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
            },
            method: 'GET',
            signal,
        })
        if (!response.ok || response.body === null) {
            const responseBody = await response.text()
            throw createAppError(parseAgentError(responseBody) ?? `ENGINE_AGENT_${response.status}`)
        }
        return response.body
    }

    return {
        connectContainerNetwork: async (containerId: string, input: unknown) =>
            requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/networks/connect`,
                'POST',
                operationResultSchema,
                containerNetworkAttachmentSchema.parse(input),
            ),
        createContainer: async (input: unknown) =>
            requestJson('/v1/containers', 'POST', operationResultSchema, containerCreateRequestSchema.parse(input)),
        createNetwork: async (input: unknown) => requestJson('/v1/networks', 'POST', operationResultSchema, networkCreateRequestSchema.parse(input)),
        createVolume: async (input: unknown) => requestJson('/v1/volumes', 'POST', operationResultSchema, volumeCreateRequestSchema.parse(input)),
        disconnectContainerNetwork: async (containerId: string, input: unknown) =>
            requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/networks/disconnect`,
                'POST',
                operationResultSchema,
                containerNetworkAttachmentSchema.parse(input),
            ),
        executeContainer: async (containerId: string, input: unknown) => {
            const parsedInput = containerExecRequestSchema.parse(input)
            return requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/exec`,
                'POST',
                containerExecResultSchema,
                parsedInput,
                parsedInput.timeoutMs + AGENT_REQUEST_TIMEOUT_MS,
            )
        },
        createInteractiveExecTicket: async (containerId: string, input: unknown) =>
            requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/exec-tickets`,
                'POST',
                interactiveExecTicketSchema,
                interactiveExecTicketRequestSchema.parse(input),
            ),
        getInteractiveExecWebSocketUrl: (ticket: string) => {
            const url = new URL(`/ws/exec/${encodeURIComponent(ticket)}`, baseUrl)
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
            return url.toString()
        },
        getContainers: async () => requestJson('/v1/containers', 'GET', containerSummaryListSchema),
        getContainer: async (containerId: string) => requestJson(`/v1/containers/${encodeURIComponent(containerId)}`, 'GET', containerDetailSchema),
        getContainerLogs: async (containerId: string, input: unknown) => {
            const request = containerLogRequestSchema.parse(input)
            const query = new URLSearchParams({ tail: request.tail.toString() })
            if (request.since) {
                query.set('since', request.since)
            }
            return requestJson(`/v1/containers/${encodeURIComponent(containerId)}/logs?${query.toString()}`, 'GET', containerLogResultSchema)
        },
        changesContainer: async (containerId: string) =>
            requestJson(`/v1/containers/${encodeURIComponent(containerId)}/changes`, 'GET', containerChangeListSchema),
        topContainer: async (containerId: string) =>
            requestJson(`/v1/containers/${encodeURIComponent(containerId)}/top`, 'GET', containerTopResultSchema),
        waitContainer: async (containerId: string, input: unknown) => {
            const request = containerWaitRequestSchema.parse(input)
            return requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/wait`,
                'POST',
                containerWaitResultSchema,
                request,
                request.timeoutMs + AGENT_REQUEST_TIMEOUT_MS,
            )
        },
        pullImage: async (input: unknown) =>
            requestJson('/v1/images/pull', 'POST', imagePullResultSchema, imagePullRequestSchema.parse(input), AGENT_IMAGE_PULL_TIMEOUT_MS),
        removeRegistryCredential: async (credentialId: string, input: unknown) =>
            requestJson(
                `/v1/registry-credentials/${encodeURIComponent(credentialId)}`,
                'DELETE',
                registryCredentialSchema,
                registryCredentialDeleteSchema.parse(input),
            ),
        tagImage: async (imageId: string, input: unknown) =>
            requestJson(`/v1/images/${encodeURIComponent(imageId)}/tag`, 'POST', operationResultSchema, imageTagRequestSchema.parse(input)),
        openEventStream: (signal: AbortSignal) => openStream('/v1/streams/events', signal),
        openContainerLogStream: (containerId: string, tail: number, signal: AbortSignal) =>
            openStream(`/v1/streams/containers/${encodeURIComponent(containerId)}/logs?tail=${tail}`, signal),
        openContainerStatsStream: (containerId: string, signal: AbortSignal) =>
            openStream(`/v1/streams/containers/${encodeURIComponent(containerId)}/stats`, signal),
        getImages: async () => requestJson('/v1/images', 'GET', imageSummaryListSchema),
        getImageRemovalImpact: async (imageId: string) =>
            requestJson(`/v1/images/${encodeURIComponent(imageId)}/removal-impact`, 'GET', imageRemovalImpactSchema),
        getNetworks: async () => requestJson('/v1/networks', 'GET', networkSummaryListSchema),
        getOverview: async () => requestJson('/v1/system/overview', 'GET', engineOverviewSchema),
        getPrunePreview: async (input: unknown) => {
            const request = prunePreviewRequestSchema.parse(input)
            return requestJson(`/v1/system/prune-preview?includeVolumes=${request.includeVolumes}`, 'GET', prunePreviewSchema)
        },
        getRegistryCredentials: async () => requestJson('/v1/registry-credentials', 'GET', registryCredentialListSchema),
        pruneBuildCache: async (input: unknown) =>
            requestJson('/v1/system/prune-build-cache', 'POST', buildCachePruneResultSchema, buildCachePruneRequestSchema.parse(input)),
        getVolumes: async () => requestJson('/v1/volumes', 'GET', volumeSummaryListSchema),
        loadImage: async (input: unknown) =>
            requestJson('/v1/images/load', 'POST', imageLoadResultSchema, imageLoadRequestSchema.parse(input), 608_000),
        probeContainer: async (containerId: string, input: unknown) =>
            requestJson(
                `/v1/containers/${encodeURIComponent(containerId)}/probe`,
                'POST',
                containerHealthProbeResultSchema,
                containerHealthProbeRequestSchema.parse(input),
                38_000,
            ),
        getNginxConfig: async () => requestJson('/v1/nginx/config', 'GET', nginxConfigStateSchema),
        applyNginxConfig: async (input: unknown) =>
            requestJson('/v1/nginx/config/apply', 'POST', nginxConfigApplyResultSchema, nginxConfigApplySchema.parse(input), 60_000),
        performContainerAction: async (containerId: string, input: unknown) => {
            const action = containerActionSchema.parse(input)
            const timeoutMs =
                action.action === 'stop' || action.action === 'restart'
                    ? action.timeoutSeconds * 1_000 + AGENT_REQUEST_TIMEOUT_MS
                    : AGENT_REQUEST_TIMEOUT_MS
            return requestJson(`/v1/containers/${encodeURIComponent(containerId)}/actions`, 'POST', operationResultSchema, action, timeoutMs)
        },
        removeImage: async (imageId: string, input: unknown) =>
            requestJson(`/v1/images/${encodeURIComponent(imageId)}`, 'DELETE', operationResultSchema, imageRemoveRequestSchema.parse(input)),
        removeNetwork: async (networkId: string, input: unknown) =>
            requestJson(
                `/v1/networks/${encodeURIComponent(networkId)}`,
                'DELETE',
                operationResultSchema,
                dockerResourceRemoveRequestSchema.parse(input),
            ),
        removeVolume: async (volumeName: string, input: unknown) =>
            requestJson(
                `/v1/volumes/${encodeURIComponent(volumeName)}`,
                'DELETE',
                operationResultSchema,
                dockerResourceRemoveRequestSchema.parse(input),
            ),
        upsertRegistryCredential: async (credentialId: string | undefined, input: unknown) =>
            requestJson(
                credentialId === undefined ? '/v1/registry-credentials' : `/v1/registry-credentials/${encodeURIComponent(credentialId)}`,
                'POST',
                registryCredentialSchema,
                registryCredentialUpsertSchema.parse(input),
            ),
    }
}

export type EngineAgentClient = ReturnType<typeof createEngineAgentClient>
