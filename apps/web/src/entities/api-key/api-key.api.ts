import { apiKeyListSchema } from '@containers/contracts/api-key'
import { z } from 'zod'

const responseSchema = z.object({ data: apiKeyListSchema, success: z.literal(true) })

export const getApiKeys = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/api-keys`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`API key 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
