import type { AppType } from '@containers/api/app'
import { trafficAnalyticsSchema, trafficSummarySchema } from '@containers/contracts/traffic'
import { hc } from 'hono/client'
import { z } from 'zod'

const summaryResponseSchema = z.object({ data: trafficSummarySchema, success: z.literal(true) })
const analyticsResponseSchema = z.object({ data: trafficAnalyticsSchema, success: z.literal(true) })

export const getTrafficSummary = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.traffic.summary.$get({ query: { windowMinutes: '1' } }, { headers: { cookie } })

    if (!response.ok) {
        throw new Error(`트래픽 상태 조회 실패: ${response.status}`)
    }

    return summaryResponseSchema.parse(await response.json()).data
}

export const getTrafficAnalytics = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.traffic.analytics.$get(
        { query: { limit: '25', statusClass: 'all', windowMinutes: '60' } },
        { headers: { cookie } },
    )

    if (!response.ok) {
        throw new Error(`트래픽 분석 조회 실패: ${response.status}`)
    }

    return analyticsResponseSchema.parse(await response.json()).data
}
