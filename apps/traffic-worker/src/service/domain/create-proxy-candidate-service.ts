import { proxyCandidateListSchema } from '@containers/contracts/trusted-proxy'

const DEFAULT_SCAN_BYTES = 2 * 1_024 * 1_024
const MAX_CANDIDATES = 50

type AccessLogLine = {
    client_ip?: unknown
    host?: unknown
    status?: unknown
    timestamp?: unknown
}

type ProxyCandidateServiceDependencies = {
    accessLogPath: string
    readTail: (path: string, bytes: number) => Promise<string>
    scanBytes?: number
}

type Accumulated = {
    address: string
    firstSeenAt: string
    hosts: Set<string>
    lastSeenAt: string
    requestCount: number
}

const parseLine = (line: string): AccessLogLine | null => {
    try {
        const parsed: unknown = JSON.parse(line)
        return typeof parsed === 'object' && parsed !== null ? (parsed as AccessLogLine) : null
    } catch {
        return null
    }
}

const asText = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null)

/**
 * Derives the distinct source addresses seen in the recent nginx access log. These are the raw
 * `$remote_addr` values before any real ip substitution, which is exactly what an operator needs
 * to decide whether a reverse proxy in front of the stack should be trusted.
 */
export const createProxyCandidateService = ({ accessLogPath, readTail, scanBytes = DEFAULT_SCAN_BYTES }: ProxyCandidateServiceDependencies) => ({
    list: async (excluded: readonly string[]) => {
        const excludedAddresses = new Set(excluded)
        const content = await readTail(accessLogPath, scanBytes).catch(() => '')
        const accumulated = new Map<string, Accumulated>()

        for (const line of content.split('\n')) {
            const parsed = line.length === 0 ? null : parseLine(line)
            if (parsed === null) continue

            const address = asText(parsed.client_ip)
            const timestamp = asText(parsed.timestamp)
            if (address === null || timestamp === null || excludedAddresses.has(address)) continue

            const existing = accumulated.get(address)
            const host = asText(parsed.host)
            if (existing === undefined) {
                accumulated.set(address, {
                    address,
                    firstSeenAt: timestamp,
                    hosts: new Set(host === null ? [] : [host]),
                    lastSeenAt: timestamp,
                    requestCount: 1,
                })
                continue
            }

            existing.lastSeenAt = timestamp
            existing.requestCount += 1
            if (host !== null) existing.hosts.add(host)
        }

        return proxyCandidateListSchema.parse(
            Array.from(accumulated.values())
                .sort((left, right) => right.requestCount - left.requestCount)
                .slice(0, MAX_CANDIDATES)
                .map((candidate) => ({
                    address: candidate.address,
                    firstSeenAt: candidate.firstSeenAt,
                    hosts: Array.from(candidate.hosts).sort(),
                    lastSeenAt: candidate.lastSeenAt,
                    requestCount: candidate.requestCount,
                })),
        )
    },
})

export type ProxyCandidateService = ReturnType<typeof createProxyCandidateService>
