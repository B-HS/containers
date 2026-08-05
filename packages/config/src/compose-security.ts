export const DOCKER_SOCKET_PATH = '/var/run/docker.sock'
export const LOOPBACK_PUBLISH_PREFIXES = ['127.0.0.1:', '[::1]:'] as const
export const SOCKET_ALLOWED_SERVICES = ['engine-agent'] as const
export const PUBLISH_ALLOWED_SERVICES = ['nginx', 'cloudflared'] as const

const HOST_NAMESPACE_KEYS = ['pid', 'ipc', 'uts', 'network_mode'] as const
const FORBIDDEN_CAPABILITIES = ['ALL', 'SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'NET_ADMIN']

type ComposeService = {
    cap_add?: string[]
    devices?: string[]
    ipc?: string
    network_mode?: string
    pid?: string
    ports?: string[]
    privileged?: boolean
    read_only?: boolean
    security_opt?: string[]
    uts?: string
    volumes?: string[]
}

export type ComposeFile = { services?: Record<string, ComposeService> }

export type ComposeSecurityViolation = { rule: string; service: string; detail: string }

const bindSource = (mount: string) => mount.split(':')[0] ?? ''

const publishHost = (mapping: string) => {
    const parts = mapping.split(':')
    return parts.length >= 3 ? `${parts.slice(0, parts.length - 2).join(':')}:` : ''
}

const isLoopbackPublish = (mapping: string) =>
    LOOPBACK_PUBLISH_PREFIXES.some((prefix) => publishHost(mapping).startsWith(prefix)) ||
    publishHost(mapping).startsWith('${PANEL_BIND_ADDRESS:-127.0.0.1}:')

/**
 * Checks a parsed compose file against the security invariants the shipped stack must keep.
 * Returns every violation found so a caller can report them all at once.
 */
export const findComposeSecurityViolations = (compose: ComposeFile): ComposeSecurityViolation[] =>
    Object.entries(compose.services ?? {}).flatMap(([service, definition]) => {
        const violations: ComposeSecurityViolation[] = []

        if (definition.privileged === true) {
            violations.push({ detail: 'privileged: true', rule: 'no-privileged', service })
        }

        for (const key of HOST_NAMESPACE_KEYS) {
            const value = definition[key]
            if (typeof value === 'string' && value.includes('host')) {
                violations.push({ detail: `${key}: ${value}`, rule: 'no-host-namespace', service })
            }
        }

        if (definition.devices !== undefined && definition.devices.length > 0) {
            violations.push({ detail: `devices: ${definition.devices.join(', ')}`, rule: 'no-device-mapping', service })
        }

        if (definition.read_only !== true) {
            violations.push({ detail: 'read_only 가 true 가 아니다', rule: 'read-only-rootfs', service })
        }

        if (!(definition.security_opt ?? []).includes('no-new-privileges:true')) {
            violations.push({ detail: 'security_opt 에 no-new-privileges:true 가 없다', rule: 'no-new-privileges', service })
        }

        for (const capability of definition.cap_add ?? []) {
            if (FORBIDDEN_CAPABILITIES.includes(capability.toUpperCase())) {
                violations.push({ detail: `cap_add: ${capability}`, rule: 'no-dangerous-capability', service })
            }
        }

        for (const mount of definition.volumes ?? []) {
            const source = bindSource(mount)
            if (source === DOCKER_SOCKET_PATH && !SOCKET_ALLOWED_SERVICES.includes(service as (typeof SOCKET_ALLOWED_SERVICES)[number])) {
                violations.push({ detail: mount, rule: 'docker-socket-scope', service })
            }
            if (source === '/' || source === '/etc' || source === '/usr' || source === '/var') {
                violations.push({ detail: mount, rule: 'no-host-root-mount', service })
            }
        }

        for (const mapping of definition.ports ?? []) {
            if (!PUBLISH_ALLOWED_SERVICES.includes(service as (typeof PUBLISH_ALLOWED_SERVICES)[number])) {
                violations.push({ detail: mapping, rule: 'publish-scope', service })
            }
            if (!isLoopbackPublish(mapping)) {
                violations.push({ detail: mapping, rule: 'loopback-publish-only', service })
            }
        }

        return violations
    })
