import {
    fromRealIpSource,
    MAX_TRUSTED_PROXIES,
    proxyCandidateListSchema,
    toRealIpSource,
    trustedProxyApproveSchema,
    trustedProxyStateSchema,
} from '@containers/contracts/trusted-proxy'
import { applyTrustedProxies, readTrustedProxies } from '@containers/nginx-config/trusted-proxy'
import { createAppError } from '../../../lib/error'

type TrustedProxyRecord = {
    address: string
    approvedAt: Date
    hostname: string | null
    note: string | null
}

type TrustedProxyServiceDb = {
    list: () => TrustedProxyRecord[]
    remove: (address: string) => void
    save: (record: TrustedProxyRecord & { approvedBy: string | null }) => void
}

type NginxConfigClient = {
    applyNginxConfig: (input: { config: string; expectedSha256: string }) => Promise<unknown>
    getNginxConfig: () => Promise<{ config: string; sha256: string }>
}

type TrustedProxyServiceDependencies = {
    db: TrustedProxyServiceDb
    listCandidates: (excluded: readonly string[]) => Promise<unknown>
    nginxClient: NginxConfigClient
    now: () => Date
    resolveHostname: (address: string) => Promise<string | null>
}

export const createTrustedProxyService = ({ db, listCandidates, nginxClient, now, resolveHostname }: TrustedProxyServiceDependencies) => {
    const syncNginx = async (addresses: readonly string[]) => {
        const current = await nginxClient.getNginxConfig()
        const nextConfig = applyTrustedProxies(current.config, addresses.map(toRealIpSource))
        if (nextConfig === null) return
        await nginxClient.applyNginxConfig({ config: nextConfig, expectedSha256: current.sha256 })
    }

    const readEffectiveSources = async () => readTrustedProxies((await nginxClient.getNginxConfig()).config)

    return {
        approve: async (actorId: string | null, input: unknown) => {
            const payload = trustedProxyApproveSchema.parse(input)
            const approved = db.list()
            if (approved.length >= MAX_TRUSTED_PROXIES && !approved.some((record) => record.address === payload.address)) {
                throw createAppError('TRUSTED_PROXY_LIMIT_REACHED')
            }

            const hostname = await resolveHostname(payload.address)
            const next = Array.from(new Set([...approved.map((record) => record.address), payload.address]))
            await syncNginx(next)
            db.save({ address: payload.address, approvedAt: now(), approvedBy: actorId, hostname, note: payload.note })
        },
        getState: async () => {
            const approved = db.list()
            const effectiveSources = await readEffectiveSources()
            const excluded = Array.from(new Set([...approved.map((record) => record.address), ...effectiveSources.map(fromRealIpSource)]))
            const candidates = proxyCandidateListSchema.parse(await listCandidates(excluded))

            return trustedProxyStateSchema.parse({
                approved: approved.map((record) => ({
                    address: record.address,
                    approvedAt: record.approvedAt.toISOString(),
                    hostname: record.hostname,
                    note: record.note,
                })),
                candidates: await Promise.all(
                    candidates.map(async (candidate) => ({ ...candidate, hostname: await resolveHostname(candidate.address) })),
                ),
                effectiveSources,
            })
        },
        revoke: async (address: string) => {
            const remaining = db.list().filter((record) => record.address !== address)
            if (remaining.length === 0) {
                throw createAppError('TRUSTED_PROXY_LAST_ENTRY')
            }
            await syncNginx(remaining.map((record) => record.address))
            db.remove(address)
        },
    }
}

export type TrustedProxyService = ReturnType<typeof createTrustedProxyService>
export type { TrustedProxyRecord, TrustedProxyServiceDb }
