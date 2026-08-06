import { operationJobSchema } from '@containers/contracts/operation-job'
import {
    composeStackPreviewSchema,
    deploymentStackListSchema,
    deploymentStackReleaseListSchema,
    deploymentStackReleaseSchema,
} from '@containers/contracts/deployment-stack'
import { z } from 'zod'

const deploymentStackResponseSchema = z.object({ data: deploymentStackListSchema, success: z.literal(true) })
const deploymentStackReleaseResponseSchema = z.object({ data: deploymentStackReleaseListSchema, success: z.literal(true) })

export const composeStackPreviewResponseSchema = z.object({ data: composeStackPreviewSchema, success: z.literal(true) })

export const deploymentStackReleaseJobResponseSchema = z.object({
    data: z.object({ job: operationJobSchema, stackRelease: deploymentStackReleaseSchema }),
    success: z.literal(true),
})

export const getDeploymentStacks = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/deployment-stacks`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`compose 스택 목록 조회 실패: ${response.status}`)
    }
    return deploymentStackResponseSchema.parse(await response.json()).data
}

export const getDeploymentStackReleases = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/deployment-stack-releases`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`compose 스택 배포 목록 조회 실패: ${response.status}`)
    }
    return deploymentStackReleaseResponseSchema.parse(await response.json()).data
}
