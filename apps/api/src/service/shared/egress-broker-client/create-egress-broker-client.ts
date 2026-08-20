import { randomUUID } from 'node:crypto'
import { createInternalRequestSignature, INTERNAL_AUTH_HEADERS } from '@containers/contracts/internal-auth'
import { egressResolveResultSchema, egressWebhookResultSchema, type EgressWebhookRequest } from '@containers/contracts/egress'
import { createAppError } from '../../../lib/error'

const RESOLVE_REQUEST_TIMEOUT_MS = 10_000
const WEBHOOK_REQUEST_TIMEOUT_MARGIN_MS = 5_000

type EgressBrokerClientDependencies = {
    baseUrl: string
    fetcher?: typeof fetch
    secret: string
}

const readErrorCode = async (response: Response) => {
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error) {
        return String(body.error.code)
    }
    return null
}

export const createEgressBrokerClient = ({ baseUrl, fetcher = fetch, secret }: EgressBrokerClientDependencies) => {
    const post = async (path: string, payload: unknown, timeoutMs: number) => {
        const body = JSON.stringify(payload)
        const timestamp = Date.now().toString()
        const nonce = randomUUID()
        const signature = createInternalRequestSignature({ body, method: 'POST', nonce, path, secret, timestamp })
        try {
            return await fetcher(`${baseUrl}${path}`, {
                body,
                headers: {
                    'content-type': 'application/json',
                    [INTERNAL_AUTH_HEADERS.NONCE]: nonce,
                    [INTERNAL_AUTH_HEADERS.SIGNATURE]: signature,
                    [INTERNAL_AUTH_HEADERS.TIMESTAMP]: timestamp,
                },
                method: 'POST',
                signal: AbortSignal.timeout(timeoutMs),
            })
        } catch {
            throw createAppError('EGRESS_BROKER_UNAVAILABLE')
        }
    }

    return {
        deliverWebhook: async (input: EgressWebhookRequest) => {
            const response = await post('/v1/egress/webhook', input, input.timeoutMs + WEBHOOK_REQUEST_TIMEOUT_MARGIN_MS)
            if (!response.ok) {
                const code = await readErrorCode(response)
                if (code === 'EGRESS_TARGET_BLOCKED' || code === 'EGRESS_DELIVERY_FAILED') {
                    throw createAppError(code)
                }
                throw createAppError('EGRESS_BROKER_UNAVAILABLE')
            }
            const body: unknown = await response.json()
            return egressWebhookResultSchema.parse((body as { data: unknown }).data)
        },
        resolveHostname: async (hostname: string) => {
            const response = await post('/v1/egress/resolve', { hostname }, RESOLVE_REQUEST_TIMEOUT_MS)
            if (!response.ok) {
                throw createAppError('EGRESS_BROKER_UNAVAILABLE')
            }
            const body: unknown = await response.json()
            return egressResolveResultSchema.parse((body as { data: unknown }).data)
        },
    }
}

export type EgressBrokerClient = ReturnType<typeof createEgressBrokerClient>
