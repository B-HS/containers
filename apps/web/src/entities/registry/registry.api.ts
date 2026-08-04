import { registryCredentialListSchema } from '@containers/contracts/registry-credential'

export const getRegistryCredentials = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/registry-credentials`, { headers: { cookie } })
    if (!response.ok) throw new Error('Registry credential 조회 실패')
    const body: unknown = await response.json()
    return registryCredentialListSchema.parse(body && typeof body === 'object' && 'data' in body ? body.data : undefined)
}
