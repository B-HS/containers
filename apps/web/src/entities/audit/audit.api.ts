import { auditEventListSchema } from '@containers/contracts/audit'
import { z } from 'zod'

const responseSchema = z.object({ data: auditEventListSchema, success: z.literal(true) })

export const getAuditEvents = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/audit?limit=100`, { headers: { cookie } })

    if (!response.ok) {
        throw new Error(`감사 기록 조회 실패: ${response.status}`)
    }

    return responseSchema.parse(await response.json()).data
}
