const SECURE_ATTRIBUTE = 'Secure'
const HTTPS_PROTOCOL = 'https'

const hasSecureAttribute = (cookie: string) =>
    cookie
        .split(';')
        .slice(1)
        .some((attribute) => attribute.trim().toLowerCase() === SECURE_ATTRIBUTE.toLowerCase())

/**
 * Reports whether the original client request reached the panel over TLS. The value comes
 * from the forwarded protocol header that nginx derives from the trusted front proxy, since
 * TLS terminates before the container network.
 */
export const isForwardedHttps = (headers: Headers) => headers.get('x-forwarded-proto')?.trim().toLowerCase() === HTTPS_PROTOCOL

/**
 * Adds the Secure attribute to every cookie the response sets. The cookie name is left alone
 * so an existing session survives a scheme change; only the transport restriction tightens.
 */
export const applySecureCookies = (headers: Headers) => {
    const cookies = headers.getSetCookie()
    if (cookies.length === 0 || cookies.every(hasSecureAttribute)) return

    headers.delete('set-cookie')
    for (const cookie of cookies) {
        headers.append('set-cookie', hasSecureAttribute(cookie) ? cookie : `${cookie}; ${SECURE_ATTRIBUTE}`)
    }
}
