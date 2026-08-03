import { z } from 'zod'
import { controlPlaneStatusSchema } from '@containers/contracts/control-plane'

const responseSchema = z.object({ data: controlPlaneStatusSchema, success: z.literal(true) })

export const getControlPlaneStatus = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/control-plane/status`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`control plane 상태 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
