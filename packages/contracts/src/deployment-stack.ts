import { z } from 'zod'
import { deploymentManifestInputSchema, deploymentNameSchema, deploymentVersionSchema } from './deployment'

export const COMPOSE_SOURCE_MAX_BYTES = 262_144
export const COMPOSE_SERVICE_MAX_COUNT = 32

export const COMPOSE_REJECTION_RULE = {
    DEVICE_MAPPING: 'device-mapping',
    DOCKER_SOCKET: 'docker-socket',
    ENVIRONMENT_VALUE_MISSING: 'environment-value-missing',
    FORBIDDEN_CAPABILITY: 'forbidden-capability',
    HOST_BIND_MOUNT: 'host-bind-mount',
    HOST_NAMESPACE: 'host-namespace',
    PLAINTEXT_ENVIRONMENT: 'plaintext-environment',
    PRIVILEGED: 'privileged',
} as const

export const composeRejectionRuleSchema = z.enum([
    COMPOSE_REJECTION_RULE.DEVICE_MAPPING,
    COMPOSE_REJECTION_RULE.DOCKER_SOCKET,
    COMPOSE_REJECTION_RULE.ENVIRONMENT_VALUE_MISSING,
    COMPOSE_REJECTION_RULE.FORBIDDEN_CAPABILITY,
    COMPOSE_REJECTION_RULE.HOST_BIND_MOUNT,
    COMPOSE_REJECTION_RULE.HOST_NAMESPACE,
    COMPOSE_REJECTION_RULE.PLAINTEXT_ENVIRONMENT,
    COMPOSE_REJECTION_RULE.PRIVILEGED,
])

export const composeRejectionSchema = z.object({
    detail: z.string(),
    rule: composeRejectionRuleSchema,
    service: z.string(),
})

export const composeRejectionListSchema = z.array(composeRejectionSchema)

export const composeIgnoredKeySchema = z.object({
    key: z.string(),
    reason: z.string(),
    service: z.string(),
})

export const composeServicePlanSchema = z.object({
    dependsOn: z.array(z.string()),
    manifest: deploymentManifestInputSchema,
    service: z.string(),
})

export const composeStackPreviewSchema = z.object({
    ignored: z.array(composeIgnoredKeySchema),
    order: z.array(z.string()),
    services: z.array(composeServicePlanSchema),
})

export const composeStackInputSchema = z.object({
    compose: z.string().min(1).max(COMPOSE_SOURCE_MAX_BYTES),
    name: deploymentNameSchema,
    version: deploymentVersionSchema,
})

export const deploymentStackSchema = z.object({
    createdAt: z.iso.datetime(),
    createdBy: z.string().min(1),
    id: z.uuid(),
    manifestIds: z.array(z.uuid()),
    name: deploymentNameSchema,
    serviceOrder: z.array(z.string()),
    updatedAt: z.iso.datetime(),
    version: deploymentVersionSchema,
})

export const deploymentStackListSchema = z.array(deploymentStackSchema)

export const DEPLOYMENT_STACK_RELEASE_STATUS = {
    FAILED: 'failed',
    HEALTHY: 'healthy',
    RELEASING: 'releasing',
    ROLLED_BACK: 'rolled-back',
} as const

export const deploymentStackReleaseStatusSchema = z.enum([
    DEPLOYMENT_STACK_RELEASE_STATUS.FAILED,
    DEPLOYMENT_STACK_RELEASE_STATUS.HEALTHY,
    DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING,
    DEPLOYMENT_STACK_RELEASE_STATUS.ROLLED_BACK,
])

export const deploymentStackReleaseSchema = z.object({
    createdAt: z.iso.datetime(),
    createdBy: z.string().min(1),
    failureCode: z.string().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    releaseIds: z.array(z.uuid()),
    stackId: z.uuid(),
    status: deploymentStackReleaseStatusSchema,
    updatedAt: z.iso.datetime(),
})

export const deploymentStackReleaseListSchema = z.array(deploymentStackReleaseSchema)

export type ComposeIgnoredKey = z.infer<typeof composeIgnoredKeySchema>
export type ComposeRejection = z.infer<typeof composeRejectionSchema>
export type ComposeServicePlan = z.infer<typeof composeServicePlanSchema>
export type ComposeStackInput = z.infer<typeof composeStackInputSchema>
export type ComposeStackPreview = z.infer<typeof composeStackPreviewSchema>
export type DeploymentStack = z.infer<typeof deploymentStackSchema>
export type DeploymentStackRelease = z.infer<typeof deploymentStackReleaseSchema>
