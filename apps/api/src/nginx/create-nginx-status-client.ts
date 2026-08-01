import { nginxStatusSchema } from '@containers/contracts/nginx'

const NGINX_STATUS_TIMEOUT_MS = 3_000
const nginxStatusPattern =
    /Active connections:\s+(\d+)\s+server accepts handled requests\s+(\d+)\s+(\d+)\s+(\d+)\s+Reading:\s+(\d+)\s+Writing:\s+(\d+)\s+Waiting:\s+(\d+)/

type NginxStatusClientDependencies = {
    fetcher?: typeof fetch
    statusUrl: string
}

export const createNginxStatusClient = ({ fetcher = fetch, statusUrl }: NginxStatusClientDependencies) => ({
    getStatus: async () => {
        const response = await fetcher(statusUrl, { signal: AbortSignal.timeout(NGINX_STATUS_TIMEOUT_MS) })

        if (!response.ok) {
            throw new Error(`Nginx status 응답 코드: ${response.status}`)
        }

        const match = nginxStatusPattern.exec(await response.text())

        if (!match) {
            throw new Error('Nginx status 응답 형식이 올바르지 않습니다.')
        }

        return nginxStatusSchema.parse({
            acceptedConnections: Number(match[2]),
            activeConnections: Number(match[1]),
            handledConnections: Number(match[3]),
            readingConnections: Number(match[5]),
            requests: Number(match[4]),
            waitingConnections: Number(match[7]),
            writingConnections: Number(match[6]),
        })
    },
})

export type NginxStatusClient = ReturnType<typeof createNginxStatusClient>
