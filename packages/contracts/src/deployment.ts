import { z } from 'zod'
import { deploymentSecretBindingSchema } from './deployment-secret'
import { containerRuntimeSchema } from './container-runtime'

export const deploymentNameSchema = z.string().regex(/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
export const deploymentVersionSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,62}[A-Za-z0-9])?$/)
export const imageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const environmentKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)
const hostnameSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
const routePathSchema = z
    .string()
    .trim()
    .regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/)
const dockerResourceNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/)

export const deploymentManifestInputSchema = z
    .object({
        command: z.array(z.string().min(1).max(4_096)).max(64).default([]),
        entrypoint: z.array(z.string().min(1).max(4_096)).max(16).default([]),
        environmentKeys: z.array(environmentKeySchema).max(128).default([]),
        healthcheck: z.object({
            intervalSeconds: z.number().int().min(2).max(300).default(10),
            path: routePathSchema,
            retries: z.number().int().min(1).max(20).default(5),
            startPeriodSeconds: z.number().int().min(0).max(600).default(10),
            timeoutSeconds: z.number().int().min(1).max(30).default(3),
        }),
        imageDigest: imageDigestSchema,
        internalPort: z.number().int().min(1).max(65_535),
        memoryBytes: z.number().int().min(16_777_216).max(68_719_476_736).default(536_870_912),
        name: deploymentNameSchema,
        nanoCpus: z.number().int().min(100_000_000).max(10_000_000_000).default(1_000_000_000),
        network: dockerResourceNameSchema.default('containers_edge'),
        pidsLimit: z.number().int().min(16).max(4_096).default(256),
        protocol: z.enum(['http', 'websocket']).default('http'),
        restartPolicy: z.enum(['no', 'on-failure', 'unless-stopped']).default('unless-stopped'),
        runtime: containerRuntimeSchema.prefault({}),
        rollout: z.object({
            observationSeconds: z.number().int().min(10).max(3_600).default(60),
            rollbackRetentionSeconds: z.number().int().min(60).max(604_800).default(86_400),
        }),
        route: z
            .object({
                hostname: hostnameSchema,
                path: routePathSchema.default('/'),
                stripPrefix: z.boolean().default(false),
            })
            .nullable()
            .default(null),
        secrets: z.array(deploymentSecretBindingSchema).max(128).default([]),
        version: deploymentVersionSchema,
        volumes: z
            .array(
                z.object({
                    mountPath: z.string().startsWith('/').max(4_096),
                    name: dockerResourceNameSchema,
                    readOnly: z.boolean().default(false),
                }),
            )
            .max(32)
            .default([]),
    })
    .superRefine((input, context) => {
        const environmentKeys = [...input.environmentKeys, ...input.secrets.map((secret) => secret.environmentKey)]
        if (new Set(environmentKeys).size !== environmentKeys.length) {
            context.addIssue({ code: 'custom', message: '환경변수 key가 중복되었습니다.', path: ['environmentKeys'] })
        }
        if (new Set(input.volumes.map((volume) => volume.mountPath)).size !== input.volumes.length) {
            context.addIssue({ code: 'custom', message: 'volume mount path가 중복되었습니다.', path: ['volumes'] })
        }
    })

export const deploymentManifestSchema = deploymentManifestInputSchema.safeExtend({
    createdAt: z.iso.datetime(),
    createdBy: z.string().min(1).nullable(),
    id: z.uuid(),
    updatedAt: z.iso.datetime(),
})

export const deploymentManifestListSchema = z.array(deploymentManifestSchema)

export const deploymentReleaseStatusSchema = z.enum([
    'creating',
    'failed',
    'healthy',
    'observing',
    'probing',
    'rolled-back',
    'rolling-back',
    'switching',
])

export const deploymentReleaseSchema = z.object({
    activatedAt: z.iso.datetime().nullable(),
    containerId: z.string().nullable(),
    containerName: z.string(),
    createdAt: z.iso.datetime(),
    createdBy: z.string().min(1).nullable(),
    failureCode: z.string().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    manifestId: z.uuid(),
    nginxConfigSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    nginxRouteId: z.uuid().nullable(),
    previousReleaseId: z.uuid().nullable(),
    status: deploymentReleaseStatusSchema,
    updatedAt: z.iso.datetime(),
})

export const deploymentReleaseListSchema = z.array(deploymentReleaseSchema)

export const DEPLOYMENT_FAILURE_DIAGNOSTICS_STEP = 'failure-diagnostics'

export const deploymentFailureDiagnosticsSchema = z.object({
    containerId: z.string().min(1),
    containerName: z.string().min(1),
    exitCode: z.number().int().nullable(),
    finishedAt: z.string().nullable(),
    logLines: z.array(z.string()),
    releaseId: z.uuid(),
    running: z.boolean().nullable(),
    stage: z.enum(['probe', 'route', 'observation']),
    stateError: z.string().nullable(),
    step: z.literal(DEPLOYMENT_FAILURE_DIAGNOSTICS_STEP),
})

export type DeploymentFailureDiagnostics = z.infer<typeof deploymentFailureDiagnosticsSchema>
export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>
export type DeploymentManifestInput = z.infer<typeof deploymentManifestInputSchema>
export type DeploymentRelease = z.infer<typeof deploymentReleaseSchema>
