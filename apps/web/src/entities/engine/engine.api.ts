import type { AppType } from '@containers/api/app'
import { hc } from 'hono/client'

export const getEngineDashboard = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const [overviewResponse, containersResponse] = await Promise.all([
        client.api.system.engine.$get({}, { headers: { cookie } }),
        client.api.containers.$get({}, { headers: { cookie } }),
    ])

    if (!overviewResponse.ok) {
        throw new Error(`Engine 상태 조회 실패: ${overviewResponse.status}`)
    }

    if (!containersResponse.ok) {
        throw new Error(`컨테이너 목록 조회 실패: ${containersResponse.status}`)
    }

    const [overview, containers] = await Promise.all([overviewResponse.json(), containersResponse.json()])

    return {
        containers: containers.data,
        overview: overview.data,
    }
}
