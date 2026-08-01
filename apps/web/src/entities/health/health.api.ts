import type { AppType } from '@containers/api/app'
import { hc } from 'hono/client'

export const getApiHealth = async (baseUrl: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.health.$get()

    if (!response.ok) {
        throw new Error(`API 상태 조회 실패: ${response.status}`)
    }

    return response.json()
}
