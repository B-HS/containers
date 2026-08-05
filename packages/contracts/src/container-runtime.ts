import { z } from 'zod'

export const CONTAINER_RUNTIME_PROFILE = {
    HARDENED: 'hardened',
    STANDARD: 'standard',
} as const

export const CONTAINER_RUNTIME_PROFILE_VALUES = [CONTAINER_RUNTIME_PROFILE.HARDENED, CONTAINER_RUNTIME_PROFILE.STANDARD] as const

export const FORBIDDEN_CONTAINER_CAPABILITIES = [
    'ALL',
    'AUDIT_CONTROL',
    'BPF',
    'DAC_READ_SEARCH',
    'MAC_ADMIN',
    'MAC_OVERRIDE',
    'NET_ADMIN',
    'PERFMON',
    'SYSLOG',
    'SYS_ADMIN',
    'SYS_BOOT',
    'SYS_MODULE',
    'SYS_PTRACE',
    'SYS_RAWIO',
    'SYS_TIME',
    'WAKE_ALARM',
] as const

const MAX_CAPABILITIES = 16
const MAX_WRITABLE_PATHS = 16
const MAX_PATH_LENGTH = 4_096
const CAPABILITY_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/

const isForbiddenCapability = (capability: string) =>
    (FORBIDDEN_CONTAINER_CAPABILITIES as readonly string[]).includes(capability.replace(/^CAP_/, ''))

export const containerCapabilitySchema = z
    .string()
    .regex(CAPABILITY_PATTERN)
    .refine((capability) => !isForbiddenCapability(capability), {
        message: '호스트를 장악할 수 있는 capability 는 허용되지 않습니다.',
    })

export const containerRuntimeSchema = z.object({
    capabilities: z.array(containerCapabilitySchema).max(MAX_CAPABILITIES).default([]),
    profile: z.enum(CONTAINER_RUNTIME_PROFILE_VALUES).default(CONTAINER_RUNTIME_PROFILE.STANDARD),
    writablePaths: z.array(z.string().startsWith('/').max(MAX_PATH_LENGTH)).max(MAX_WRITABLE_PATHS).default([]),
})

export type ContainerRuntime = z.infer<typeof containerRuntimeSchema>
