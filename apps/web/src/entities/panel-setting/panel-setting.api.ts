import { z } from 'zod'
import { panelSettingSchema } from '@containers/contracts/panel-setting'

const responseSchema = z.object({ data: panelSettingSchema, success: z.literal(true) })

export const getPanelSetting = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/panel-settings`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`패널 공개 주소 설정 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
