import { lookup } from 'node:dns/promises'
import {
    egressResolveRequestSchema,
    egressResolveResultSchema,
    egressWebhookRequestSchema,
    egressWebhookResultSchema,
} from '@containers/contracts/egress'
import { isPrivateAddress } from '@containers/contracts/net-guard'
import { createAppError } from '../../lib/error'

type EgressServiceDependencies = {
    fetcher?: (input: string, init?: RequestInit) => Promise<Response>
    resolveHost?: (hostname: string) => Promise<string[]>
}

const defaultResolveHost = async (hostname: string) => {
    const entries = await lookup(hostname, { all: true, verbatim: true })
    return entries.map((entry) => entry.address)
}

export const createEgressService = ({ fetcher = fetch, resolveHost = defaultResolveHost }: EgressServiceDependencies = {}) => {
    const resolvePublicAddresses = async (hostname: string) => {
        const addresses = await resolveHost(hostname).catch(() => [] as string[])
        const blocked = addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))
        return { addresses, blocked }
    }

    return {
        deliverWebhook: async (input: unknown) => {
            const request = egressWebhookRequestSchema.parse(input)
            const url = new URL(request.url)
            const { blocked } = await resolvePublicAddresses(url.hostname)
            if (blocked) {
                throw createAppError('EGRESS_TARGET_BLOCKED')
            }
            let response: Response
            try {
                response = await fetcher(request.url, {
                    body: request.body,
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(request.timeoutMs),
                })
            } catch {
                throw createAppError('EGRESS_DELIVERY_FAILED')
            }
            await response.body?.cancel().catch(() => undefined)
            const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
            return egressWebhookResultSchema.parse({
                retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
                status: response.status,
            })
        },
        resolve: async (input: unknown) => {
            const { hostname } = egressResolveRequestSchema.parse(input)
            const { addresses, blocked } = await resolvePublicAddresses(hostname)
            return egressResolveResultSchema.parse({ addresses, blocked, hostname })
        },
    }
}

export type EgressService = ReturnType<typeof createEgressService>
