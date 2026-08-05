import { z } from 'zod'

export const MAX_TRUSTED_PROXIES = 20

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const UNBOUNDED_SOURCES = ['0.0.0.0/0', '::/0', 'any', '0.0.0.0', '::']
const IPV4_HOST_PREFIX = 32
const IPV6_HOST_PREFIX = 128
const IPV4_OCTET_MAX = 255

const isIpv4Host = (value: string) => {
    const match = IPV4_PATTERN.exec(value)
    return match !== null && match.slice(1).every((octet) => Number(octet) <= IPV4_OCTET_MAX)
}

const isIpv6Host = (value: string) => value.includes(':') && URL.parse(`http://[${value}]`) !== null

export const proxyAddressSchema = z
    .string()
    .min(1)
    .max(64)
    .refine((value) => !UNBOUNDED_SOURCES.includes(value), '전체 대역은 신뢰할 수 없습니다.')
    .refine((value) => isIpv4Host(value) || isIpv6Host(value), '단일 IP 주소여야 합니다.')

export const proxyCandidateSchema = z.object({
    address: z.string(),
    firstSeenAt: z.string(),
    hosts: z.array(z.string()),
    lastSeenAt: z.string(),
    requestCount: z.number().int().nonnegative(),
})

export const proxyCandidateListSchema = z.array(proxyCandidateSchema)

export const hostnameCandidateSchema = z.object({
    firstSeenAt: z.string(),
    hostname: z.string(),
    lastSeenAt: z.string(),
    rejectedCount: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
})

export const hostnameCandidateListSchema = z.array(hostnameCandidateSchema)

export const trustedProxySchema = z.object({
    address: z.string(),
    approvedAt: z.iso.datetime(),
    hostname: z.string().nullable(),
    note: z.string().nullable(),
})

export const trustedProxyApproveSchema = z.object({
    address: proxyAddressSchema,
    note: z.string().max(200).nullable().default(null),
})

export const trustedProxyStateSchema = z.object({
    approved: z.array(trustedProxySchema),
    candidates: z.array(proxyCandidateSchema.extend({ hostname: z.string().nullable() })),
    effectiveSources: z.array(z.string()),
})

/**
 * Renders a single address as the nginx `set_real_ip_from` argument, which always carries a prefix.
 */
export const toRealIpSource = (address: string) => `${address}/${address.includes(':') ? IPV6_HOST_PREFIX : IPV4_HOST_PREFIX}`

/**
 * Recovers the bare address from an nginx `set_real_ip_from` argument.
 */
export const fromRealIpSource = (source: string) => source.split('/')[0] ?? source

export type HostnameCandidate = z.infer<typeof hostnameCandidateSchema>
export type ProxyCandidate = z.infer<typeof proxyCandidateSchema>
export type TrustedProxy = z.infer<typeof trustedProxySchema>
export type TrustedProxyState = z.infer<typeof trustedProxyStateSchema>
