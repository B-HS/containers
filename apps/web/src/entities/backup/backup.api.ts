import { z } from 'zod'
import { backupListSchema } from '@containers/contracts/backup'

const responseSchema = z.object({ data: backupListSchema, success: z.literal(true) })

export const getBackups = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/backups`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`백업 목록 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
