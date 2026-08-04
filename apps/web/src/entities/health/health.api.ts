import type { AppType } from '@containers/api/app'
import { healthSchema } from '@containers/contracts/health'
import { hc } from 'hono/client'
import { z } from 'zod'

const healthResponseSchema = z.object({ data: healthSchema, success: z.literal(true) })

export const getApiHealth = async (baseUrl: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.health.$get({})

    if (!response.ok) {
        throw new Error(`API 상태 조회 실패: ${response.status}`)
    }

    return healthResponseSchema.parse(await response.json()).data
}
