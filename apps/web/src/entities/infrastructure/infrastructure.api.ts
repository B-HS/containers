import type { AppType } from '@containers/api/app'
import { prunePreviewSchema } from '@containers/contracts/engine-control'
import { registryCredentialListSchema } from '@containers/contracts/registry-credential'
import { hc } from 'hono/client'

export const getInfrastructure = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const [networkResponse, volumeResponse] = await Promise.all([
        client.api.networks.$get({}, { headers: { cookie } }),
        client.api.volumes.$get({}, { headers: { cookie } }),
    ])

    if (!networkResponse.ok || !volumeResponse.ok) {
        throw new Error('Docker 인프라 조회 실패')
    }

    const [networks, volumes] = await Promise.all([networkResponse.json(), volumeResponse.json()])
    return { networks: networks.data, volumes: volumes.data }
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
