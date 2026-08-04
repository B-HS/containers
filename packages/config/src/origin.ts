const ORIGIN_SEPARATOR = ','

/**
 * Splits a comma separated origin list into trimmed, non-empty entries.
 */
export const parseOriginList = (value: string) =>
    value
        .split(ORIGIN_SEPARATOR)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)

/**
 * Returns the canonical origin of an absolute URL, or null when the value is not parseable.
 */
export const toOrigin = (value: string) => {
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

/**
 * Merges the panel base URL into the configured trusted origin list so that changing the public
 * origin without updating the trusted origin list cannot lock sign-in out with INVALID_ORIGIN.
 * Entries that are not absolute URLs (wildcard patterns) are preserved verbatim.
 */
export const resolveTrustedOrigins = ({ baseUrl, origins }: { baseUrl: string; origins: readonly string[] }) => {
    const baseOrigin = toOrigin(baseUrl)
    const candidates = baseOrigin === null ? origins : [...origins, baseOrigin]

    return Array.from(
        new Set(
            candidates
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
                .map((entry) => toOrigin(entry) ?? entry),
        ),
    )
}
