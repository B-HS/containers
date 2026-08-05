type HeaderReader = { get: (name: string) => string | null }

const INTERNAL_HOSTS = ['127.0.0.1', 'localhost', '::1', 'panel.containers.local', 'api.containers.local']

const hostnameOf = (host: string) => {
    const trimmed = host.trim().toLowerCase()
    if (trimmed.startsWith('[')) return trimmed.slice(1, trimmed.indexOf(']'))
    const [hostname] = trimmed.split(':')
    return hostname ?? ''
}

/**
 * Reports whether the request arrived on one of the names that exist before any public origin is
 * configured. Claiming the first owner account is unauthenticated by nature, so it is restricted
 * to those names and never served on the public origin.
 */
export const isInternalBootstrapHost = (headers: HeaderReader) => {
    const host = headers.get('host')
    return host !== null && INTERNAL_HOSTS.includes(hostnameOf(host))
}
