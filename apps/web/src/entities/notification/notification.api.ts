import { notificationDestinationListSchema } from '@containers/contracts/notification'
import { z } from 'zod'

const responseSchema = z.object({ data: notificationDestinationListSchema, success: z.literal(true) })

export const getNotificationDestinations = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/notification-destinations`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`알림 대상 목록 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
