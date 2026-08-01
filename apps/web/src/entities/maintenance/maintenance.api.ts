import { z } from 'zod'
import { maintenanceStatusSchema } from '@containers/contracts/maintenance'

const responseSchema = z.object({ data: maintenanceStatusSchema, success: z.literal(true) })

export const getMaintenanceStatus = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/maintenance`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`maintenance 상태 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
