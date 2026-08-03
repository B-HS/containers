import { operationJobSchema } from '@containers/contracts/operation-job'
import { artifactListSchema, deploymentSchema } from '@containers/contracts/upload'
import { z } from 'zod'

const responseSchema = z.object({ data: artifactListSchema, success: z.literal(true) })

export const artifactLoadResponseSchema = z.object({
    data: z.union([z.object({ deployment: deploymentSchema }), z.object({ job: operationJobSchema })]),
    success: z.literal(true),
})

export const uploadFinalizeResponseSchema = z.object({ data: z.object({ job: operationJobSchema }), success: z.literal(true) })

export const getArtifacts = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/artifacts`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`Artifact 조회 실패: ${response.status}`)
    }
    return responseSchema.parse(await response.json()).data
}
