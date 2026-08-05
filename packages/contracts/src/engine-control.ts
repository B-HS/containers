import { z } from 'zod'
import { containerRuntimeSchema } from './container-runtime'

const timeoutSecondsSchema = z.number().int().min(0).max(300).default(10)

export const containerActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('start') }),
    z.object({ action: z.literal('stop'), timeoutSeconds: timeoutSecondsSchema }),
    z.object({ action: z.literal('restart'), timeoutSeconds: timeoutSecondsSchema }),
    z.object({ action: z.literal('pause') }),
    z.object({ action: z.literal('unpause') }),
    z.object({ action: z.literal('rename'), name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/) }),
    z.object({
        action: z.literal('kill'),
        signal: z.enum(['SIGHUP', 'SIGINT', 'SIGKILL', 'SIGQUIT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2']).default('SIGKILL'),
    }),
    z.object({
        action: z.literal('update'),
        memoryBytes: z.number().int().min(16_777_216).max(68_719_476_736),
        nanoCpus: z.number().int().min(100_000_000).max(10_000_000_000),
        pidsLimit: z.number().int().min(16).max(4_096),
    }),
    z.object({
        action: z.literal('remove'),
        confirmation: z.string().min(1).max(128),
        force: z.boolean().default(false),
        removeVolumes: z.boolean().default(false),
    }),
])

export const containerWaitRequestSchema = z.object({
    timeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
})

export const containerWaitResultSchema = z.object({
    exitCode: z.number().int(),
})

export const containerTopResultSchema = z.object({
    processes: z.array(z.array(z.string())),
    titles: z.array(z.string()),
})

export const containerChangeSchema = z.object({
    kind: z.enum(['added', 'deleted', 'modified']),
    path: z.string(),
})

export const containerChangeListSchema = z.array(containerChangeSchema)

export const containerExecRequestSchema = z.object({
    command: z.array(z.string().min(1).max(4_096)).min(1).max(64),
    environment: z.array(z.string().max(8_192)).max(128).default([]),
    maxOutputBytes: z.number().int().min(1_024).max(8_388_608).default(1_048_576),
    timeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
    user: z.string().max(128).optional(),
    workingDirectory: z.string().startsWith('/').max(4_096).optional(),
})

export const containerExecResultSchema = z.object({
    exitCode: z.number().int(),
    stderr: z.string(),
    stdout: z.string(),
    truncated: z.boolean(),
})

export const interactiveExecTicketRequestSchema = z.object({
    columns: z.number().int().min(20).max(500).default(120),
    command: z.array(z.string().min(1).max(4_096)).min(1).max(64),
    environment: z.array(z.string().max(8_192)).max(128).default([]),
    rows: z.number().int().min(5).max(300).default(30),
    user: z.string().max(128).optional(),
    workingDirectory: z.string().startsWith('/').max(4_096).optional(),
})

export const interactiveExecTicketSchema = z.object({
    expiresAt: z.iso.datetime(),
    ticket: z.string().min(32).max(256),
})

export const execTicketParamSchema = z.object({
    ticket: z.string().min(32).max(256),
})

export const interactiveExecClientMessageSchema = z.discriminatedUnion('type', [
    z.object({ data: z.string().max(65_536), type: z.literal('input') }),
    z.object({ columns: z.number().int().min(20).max(500), rows: z.number().int().min(5).max(300), type: z.literal('resize') }),
    z.object({ type: z.literal('heartbeat') }),
    z.object({ type: z.literal('detach') }),
])

export const interactiveExecServerMessageSchema = z.discriminatedUnion('type', [
    z.object({ data: z.string(), type: z.literal('output') }),
    z.object({ message: z.string(), type: z.literal('error') }),
    z.object({ type: z.literal('ready') }),
    z.object({ type: z.literal('pong') }),
    z.object({ exitCode: z.number().int(), type: z.literal('exit') }),
])

export const containerCreateRequestSchema = z.object({
    autoStart: z.boolean().default(true),
    command: z.array(z.string().min(1).max(4_096)).max(64).default([]),
    containerPort: z.number().int().min(1).max(65_535).optional(),
    entrypoint: z.array(z.string().min(1).max(4_096)).max(16).default([]),
    environment: z
        .array(
            z
                .string()
                .regex(/^[A-Za-z_][A-Za-z0-9_]*=.*$/)
                .max(8_192),
        )
        .max(128)
        .default([]),
    image: z.string().min(1).max(512),
    labels: z
        .record(z.string().min(1).max(128), z.string().max(1_024))
        .default({})
        .refine((labels) => !('managed-by' in labels) && !('com.docker.compose.project' in labels), {
            message: '관리 plane 라벨은 허용되지 않습니다.',
        }),
    memoryBytes: z.number().int().min(16_777_216).max(68_719_476_736).default(536_870_912),
    name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
    nanoCpus: z.number().int().min(100_000_000).max(10_000_000_000).default(1_000_000_000),
    network: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/)
        .default('containers_edge'),
    pidsLimit: z.number().int().min(16).max(4_096).default(256),
    runtime: containerRuntimeSchema.prefault({}),
    restartPolicy: z.enum(['no', 'on-failure', 'unless-stopped']).default('unless-stopped'),
    user: z.string().max(128).optional(),
    volumes: z
        .array(
            z.object({
                mountPath: z.string().startsWith('/').max(4_096),
                name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
                readOnly: z.boolean().default(false),
            }),
        )
        .max(32)
        .default([]),
    workingDirectory: z.string().startsWith('/').max(4_096).optional(),
})

export const containerNetworkAttachmentSchema = z.object({
    network: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
})

export const containerHealthProbeRequestSchema = z.object({
    path: z.string().regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/),
    port: z.number().int().min(1).max(65_535),
    timeoutMs: z.number().int().min(250).max(30_000).default(3_000),
})

export const containerHealthProbeResultSchema = z.object({
    error: z.string().nullable(),
    healthy: z.boolean(),
    latencyMs: z.number().int().nonnegative(),
    statusCode: z.number().int().min(0).max(599),
})

export const imageSummarySchema = z.object({
    createdAt: z.iso.datetime(),
    id: z.string().min(1),
    repoDigests: z.array(z.string()),
    repoTags: z.array(z.string()),
    sharedSizeBytes: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative(),
})

export const imageSummaryListSchema = z.array(imageSummarySchema)

export const networkSummarySchema = z.object({
    attachable: z.boolean(),
    containerCount: z.number().int().nonnegative(),
    driver: z.string(),
    id: z.string().min(1),
    ingress: z.boolean(),
    internal: z.boolean(),
    labelKeys: z.array(z.string()),
    name: z.string().min(1),
    scope: z.string(),
    subnets: z.array(z.object({ gateway: z.string(), subnet: z.string() })),
})

export const networkSummaryListSchema = z.array(networkSummarySchema)

export const volumeSummarySchema = z.object({
    createdAt: z.string().nullable(),
    driver: z.string(),
    labelKeys: z.array(z.string()),
    name: z.string().min(1),
    optionKeys: z.array(z.string()),
    refCount: z.number().int(),
    scope: z.string(),
    sizeBytes: z.number().int().nonnegative(),
})

export const volumeSummaryListSchema = z.array(volumeSummarySchema)

export const dockerResourceRemoveRequestSchema = z.object({
    confirmation: z.string().min(1).max(256),
    force: z.boolean().default(false),
})

export const networkCreateRequestSchema = z
    .object({
        attachable: z.boolean().default(false),
        driver: z.literal('bridge').default('bridge'),
        gateway: z.union([z.ipv4(), z.ipv6()]).optional(),
        internal: z.boolean().default(false),
        name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
        subnet: z
            .string()
            .regex(/^[0-9a-fA-F:.]+\/\d{1,3}$/)
            .optional(),
    })
    .refine((input) => input.gateway === undefined || input.subnet !== undefined, { message: 'gateway에는 subnet이 필요합니다.', path: ['gateway'] })

export const volumeCreateRequestSchema = z.object({
    driver: z.literal('local').default('local'),
    name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
})

const expandIpv4Shorthand = (value: string): string[] | null => {
    const match = value.match(/^(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?$/)
    if (!match) {
        return null
    }
    const octets = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)))
    if (octets.length < 2 || octets.some((octet) => octet > 255)) {
        return null
    }
    while (octets.length < 4) {
        octets.push(0)
    }
    return octets.map(String)
}

const isBlockedRegistryHost = (hostname: string) => {
    const normalized = hostname.toLowerCase()
    if (normalized === 'localhost' || normalized === 'host.docker.internal' || normalized === 'registry-1.docker.io') {
        return true
    }
    if (normalized.includes('containers_control') || normalized.includes('containers_ingress') || normalized.includes('.internal')) {
        return true
    }
    const bracketedIpv6 = normalized.match(/^\[([0-9a-f:]+)\]$/)
    if (bracketedIpv6) {
        const address = bracketedIpv6[1] ?? ''
        if (
            address === '::1' ||
            address.startsWith('fe80') ||
            address.startsWith('fc') ||
            address.startsWith('fd') ||
            address.startsWith('::ffff:')
        ) {
            return true
        }
        if (address.startsWith('2002:') || address.startsWith('2001:0:')) {
            return true
        }
        return true
    }
    if (!normalized.includes('.')) {
        return true
    }
    const expanded = expandIpv4Shorthand(normalized)
    if (expanded) {
        const octets = expanded.map(Number)
        const first = octets[0]
        const second = octets[1]
        if (first === undefined || second === undefined) return true
        if (first === 10 || first === 127 || first === 0) return true
        if (first === 169 && second === 254) return true
        if (first === 172 && second >= 16 && second <= 31) return true
        if (first === 192 && second === 168) return true
        if (first === 100 && second >= 64 && second <= 127) return true
        if (first === 198 && second >= 18 && second <= 19) return true
        if (first >= 224) return true
        return false
    }
    return false
}

export const imageReferenceSchema = z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/)
    .refine(
        (reference) => {
            const components = reference.split('/')
            if (components.length === 1) {
                return true
            }
            const firstComponent = components[0] ?? ''
            const hasRegistryHost = firstComponent.includes('.') || firstComponent === 'localhost' || firstComponent.includes(':')
            if (!hasRegistryHost) {
                return true
            }
            return !isBlockedRegistryHost(firstComponent.replace(/:\d+$/, ''))
        },
        { message: '내부 레지스트리 주소는 허용되지 않습니다.' },
    )

export const imagePullRequestSchema = z.object({
    credentialId: z.uuid().optional(),
    reference: imageReferenceSchema,
})

export const imagePullResultSchema = z.object({
    messages: z.array(z.string()),
    reference: imageReferenceSchema,
})

export const imageTagRequestSchema = z.object({
    repository: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    tag: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/),
})

export const imageRemoveRequestSchema = z.object({
    confirmation: z.string().min(1).max(256),
    force: z.boolean().default(false),
    pruneChildren: z.boolean().default(false),
})

export const imageRemovalImpactSchema = z.object({
    containers: z.array(
        z.object({
            id: z.string().min(1),
            isManagementPlane: z.boolean(),
            names: z.array(z.string()),
            state: z.string().min(1),
        }),
    ),
    imageId: z.string().min(1),
    isManagementPlane: z.boolean(),
})

export const prunePreviewRequestSchema = z.object({
    includeVolumes: z.boolean().default(false),
})

const pruneCandidateSchema = z.object({
    id: z.string().min(1),
    name: z.string().nullable(),
    reclaimableBytes: z.number().int().nonnegative(),
})

export const prunePreviewSchema = z.object({
    buildCache: z.array(pruneCandidateSchema),
    containers: z.array(pruneCandidateSchema),
    images: z.array(pruneCandidateSchema),
    networks: z.array(pruneCandidateSchema),
    protectedResourceCount: z.number().int().nonnegative(),
    reclaimableBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    volumes: z.array(pruneCandidateSchema),
})

export const buildCachePruneRequestSchema = z.object({
    ids: z.array(z.string().min(1).max(256)).min(1).max(10_000),
})

export const buildCachePruneResultSchema = z.object({
    deletedIds: z.array(z.string()),
    spaceReclaimed: z.number().int().nonnegative(),
})

export const operationResultSchema = z.object({
    operation: z.string().min(1),
    targetId: z.string().min(1),
})

export type ContainerAction = z.infer<typeof containerActionSchema>
export type ContainerCreateRequest = z.infer<typeof containerCreateRequestSchema>
export type ContainerHealthProbeRequest = z.infer<typeof containerHealthProbeRequestSchema>
export type ContainerExecRequest = z.infer<typeof containerExecRequestSchema>
export type ContainerExecResult = z.infer<typeof containerExecResultSchema>
export type InteractiveExecTicketRequest = z.infer<typeof interactiveExecTicketRequestSchema>
export type ContainerWaitRequest = z.infer<typeof containerWaitRequestSchema>
export type ImagePullRequest = z.infer<typeof imagePullRequestSchema>
export type ImageTagRequest = z.infer<typeof imageTagRequestSchema>
export type ImageRemoveRequest = z.infer<typeof imageRemoveRequestSchema>
export type PrunePreviewRequest = z.infer<typeof prunePreviewRequestSchema>
export type PrunePreview = z.infer<typeof prunePreviewSchema>
export type DockerResourceRemoveRequest = z.infer<typeof dockerResourceRemoveRequestSchema>
export type NetworkCreateRequest = z.infer<typeof networkCreateRequestSchema>
export type NetworkSummary = z.infer<typeof networkSummarySchema>
export type VolumeCreateRequest = z.infer<typeof volumeCreateRequestSchema>
export type VolumeSummary = z.infer<typeof volumeSummarySchema>
