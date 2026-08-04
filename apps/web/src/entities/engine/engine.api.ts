import type { AppType } from '@containers/api/app'
import { containerSummaryListSchema, engineOverviewSchema } from '@containers/contracts/engine'
import { hc } from 'hono/client'
import { z } from 'zod'

const successResponseSchema = z.object({ data: z.unknown(), success: z.literal(true) })

export const getEngineOverview = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.system.engine.$get({}, { headers: { cookie } })

    if (!response.ok) {
        throw new Error('Engine 상태 조회 실패')
    }

    return engineOverviewSchema.parse(successResponseSchema.parse(await response.json()).data)
}

export const getContainerList = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.containers.$get({}, { headers: { cookie } })

    if (!response.ok) {
        throw new Error('컨테이너 목록 조회 실패')
    }

    return containerSummaryListSchema.parse(successResponseSchema.parse(await response.json()).data)
}
