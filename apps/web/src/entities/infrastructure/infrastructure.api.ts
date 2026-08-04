import type { AppType } from '@containers/api/app'
import { networkSummaryListSchema, prunePreviewSchema, volumeSummaryListSchema } from '@containers/contracts/engine-control'
import { registryCredentialListSchema } from '@containers/contracts/registry-credential'
import { hc } from 'hono/client'
import { z } from 'zod'

const successResponseSchema = z.object({ data: z.unknown(), success: z.literal(true) })

export const getInfrastructure = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const networkResponse = await client.api.networks.$get({}, { headers: { cookie } })
    const volumeResponse = await client.api.volumes.$get({}, { headers: { cookie } })

    if (!networkResponse.ok || !volumeResponse.ok) {
        throw new Error('Docker 인프라 조회 실패')
    }

    const networkBody = await networkResponse.json()
    const volumeBody = await volumeResponse.json()

    return {
        networks: networkSummaryListSchema.parse(successResponseSchema.parse(networkBody).data),
        volumes: volumeSummaryListSchema.parse(successResponseSchema.parse(volumeBody).data),
    }
}

export const getPrunePreview = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/system/prune-preview?includeVolumes=false`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error('Docker prune preview 조회 실패')
    }
    const body: unknown = await response.json()
    return prunePreviewSchema.parse(body && typeof body === 'object' && 'data' in body ? body.data : undefined)
}

export const getRegistryCredentials = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/registry-credentials`, { headers: { cookie } })
    if (!response.ok) throw new Error('Registry credential 조회 실패')
    const body: unknown = await response.json()
    return registryCredentialListSchema.parse(body && typeof body === 'object' && 'data' in body ? body.data : undefined)
}
