import { deploymentSecretListSchema } from '@containers/contracts/deployment-secret'
import { z } from 'zod'

const responseSchema = z.object({ data: deploymentSecretListSchema, success: z.literal(true) })

export const getDeploymentSecrets = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/deployment-secrets`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`배포 secret 목록 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
