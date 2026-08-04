import type { AppType } from '@containers/api/app'
import { containerSummaryListSchema, engineOverviewSchema } from '@containers/contracts/engine'
import { hc } from 'hono/client'
import { z } from 'zod'

const successResponseSchema = z.object({ data: z.unknown(), success: z.literal(true) })

export const getEngineDashboard = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const overviewResponse = await client.api.system.engine.$get({}, { headers: { cookie } })
    const containersResponse = await client.api.containers.$get({}, { headers: { cookie } })

    if (!overviewResponse.ok || !containersResponse.ok) {
        throw new Error('Engine 상태 조회 실패')
    }

    const [overviewBody, containersBody] = await Promise.all([overviewResponse.json(), containersResponse.json()])

    const overview = successResponseSchema.parse(overviewBody).data
    const containers = successResponseSchema.parse(containersBody).data

    return {
        containers: containerSummaryListSchema.parse(containers),
        overview: engineOverviewSchema.parse(overview),
    }
}
