import { managedUserListSchema } from '@containers/contracts/user-management'
import { z } from 'zod'

const responseSchema = z.object({ data: managedUserListSchema, success: z.literal(true) })

export const getManagedUsers = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/users`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`사용자 목록 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
