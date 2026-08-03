import { operationJobSchema } from '@containers/contracts/operation-job'
import { deploymentManifestListSchema, deploymentReleaseListSchema } from '@containers/contracts/deployment'
import { z } from 'zod'

const deploymentManifestResponseSchema = z.object({ data: deploymentManifestListSchema, success: z.literal(true) })
const deploymentReleaseResponseSchema = z.object({ data: deploymentReleaseListSchema, success: z.literal(true) })

export const deploymentReleaseJobResponseSchema = z.object({
    data: z.object({ job: operationJobSchema, release: deploymentReleaseListSchema.element }),
    success: z.literal(true),
})

export const getDeploymentManifests = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/deployment-manifests`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`배포 manifest 목록 조회 실패: ${response.status}`)
    }
    return deploymentManifestResponseSchema.parse(await response.json()).data
}

export const getDeploymentReleases = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/deployment-releases`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`배포 release 목록 조회 실패: ${response.status}`)
    }
    return deploymentReleaseResponseSchema.parse(await response.json()).data
}
