import { imageSummaryListSchema } from '@containers/contracts/engine-control'
import { z } from 'zod'

const responseSchema = z.object({ data: imageSummaryListSchema, success: z.literal(true) })

export const getImages = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/images`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`Image 목록 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
