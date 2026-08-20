const isPrivateIpv4Octets = (octets: number[]) => {
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

const parseIpv6Bytes = (value: string): number[] | null => {
    const address = value.toLowerCase()
    const hasDoubleColon = address.includes('::')
    const parts = address.split('::')
    if (parts.length > 2) {
        return null
    }
    const [head = '', tail = ''] = parts
    const headGroups = head === '' ? [] : head.split(':')
    const tailGroups = tail === '' ? [] : tail.split(':')
    const embedIpv4 = (groups: string[]) => {
        const result: number[] = []
        for (let index = 0; index < groups.length; index += 1) {
            const group = groups[index]
            if (group === undefined) {
                return null
            }
            const ipv4Embedded = group.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/)
            if (ipv4Embedded && index === groups.length - 1) {
                const octets = ipv4Embedded.slice(1).map(Number)
                if (octets.some((octet) => octet > 255)) {
                    return null
                }
                result.push(octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0)
                continue
            }
            const parsed = Number.parseInt(group, 16)
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff || !/^[0-9a-f]{1,4}$/.test(group)) {
                return null
            }
            result.push(parsed >> 8, parsed & 0xff)
        }
        return result
    }
    const headBytes = embedIpv4(headGroups)
    const tailBytes = embedIpv4(tailGroups)
    if (!headBytes || !tailBytes) {
        return null
    }
    if (!hasDoubleColon) {
        return headBytes.length === 16 ? headBytes : null
    }
    const zeroCount = 16 - headBytes.length - tailBytes.length
    if (zeroCount < 0 || zeroCount % 2 !== 0) {
        return null
    }
    return [...headBytes, ...Array.from({ length: zeroCount }, () => 0), ...tailBytes]
}

/**
 * Returns true when the address is private, loopback, link-local, CGN, multicast,
 * or cannot be parsed as a public IPv4/IPv6 address. Resolved DNS answers and IP
 * literals both go through this before the control plane talks to the target.
 */
export const isPrivateAddress = (address: string) => {
    const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
        const octets = ipv4.slice(1).map(Number)
        if (octets.some((octet) => octet > 255)) {
            return true
        }
        return isPrivateIpv4Octets(octets)
    }
    const bytes = parseIpv6Bytes(address)
    if (!bytes) {
        return true
    }
    const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff
    const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0)
    if (isIpv4Mapped || isIpv4Compatible) {
        return isPrivateIpv4Octets([bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0])
    }
    const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && (bytes[15] ?? 0) === 1
    if (isLoopback || (bytes[0] === 0xfe && ((bytes[1] ?? 0) & 0xc0) !== 0)) {
        return true
    }
    if ((bytes[0] ?? 0) === 0xfc || (bytes[0] ?? 0) === 0xfd) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x02) {
        return true
    }
    if ((bytes[0] ?? 0) === 0x20 && (bytes[1] ?? 0) === 0x01 && (bytes[2] ?? 0) === 0x00 && (bytes[3] ?? 0) === 0x00) {
        return true
    }
    if ((bytes[0] ?? 0) >= 0xff) {
        return true
    }
    return false
}

export const isIpLiteral = (host: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host) || parseIpv6Bytes(host) !== null

/**
 * Extracts the registry host from an image reference. Returns undefined for
 * Docker Hub short references (no host component) and digest-only references.
 */
export const getRegistryHost = (reference: string) => {
    const components = reference.split('/')
    const firstComponent = components[0]
    const hasPath = components.length > 1
    if (!firstComponent || !hasPath) {
        return undefined
    }
    if (!firstComponent.includes('.') && firstComponent !== 'localhost' && !firstComponent.includes(':')) {
        return undefined
    }
    return firstComponent.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
}

export const REGISTRY_HOST_VIOLATION = {
    INTERNAL_SUFFIX: 'internal-suffix',
    LOCALHOST: 'localhost',
    PRIVATE_IP: 'private-ip',
    SINGLE_LABEL: 'single-label',
} as const

export type RegistryHostViolation = (typeof REGISTRY_HOST_VIOLATION)[keyof typeof REGISTRY_HOST_VIOLATION]

/**
 * Static (DNS-free) checks that a registry host does not point at the local
 * machine or a private network by name. DNS-based depth is added separately by
 * the egress broker where a resolver is available.
 */
export const findRegistryHostViolation = (registryHost: string): RegistryHostViolation | null => {
    const host = registryHost.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost')) {
        return REGISTRY_HOST_VIOLATION.LOCALHOST
    }
    if (host.endsWith('.local') || host.endsWith('.internal')) {
        return REGISTRY_HOST_VIOLATION.INTERNAL_SUFFIX
    }
    if (isIpLiteral(host)) {
        return isPrivateAddress(host) ? REGISTRY_HOST_VIOLATION.PRIVATE_IP : null
    }
    if (!host.includes('.')) {
        return REGISTRY_HOST_VIOLATION.SINGLE_LABEL
    }
    return null
}
