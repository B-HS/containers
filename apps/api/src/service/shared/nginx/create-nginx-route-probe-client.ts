import { request as createHttpRequest } from 'node:http'

type NginxRouteProbeClientDependencies = {
    baseUrl: string
}

type NginxRouteProbeInput = {
    hostname: string
    path: string
    timeoutMs: number
}

export const createNginxRouteProbeClient = ({ baseUrl }: NginxRouteProbeClientDependencies) => {
    const base = new URL(baseUrl)

    return {
        probe: ({ hostname, path, timeoutMs }: NginxRouteProbeInput) =>
            new Promise<boolean>((resolve) => {
                const request = createHttpRequest(
                    {
                        headers: { host: hostname },
                        hostname: base.hostname,
                        method: 'GET',
                        path,
                        port: base.port || 80,
                    },
                    (response) => {
                        response.resume()
                        response.on('end', () => resolve((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300))
                    },
                )
                request.setTimeout(timeoutMs, () => {
                    request.destroy()
                    resolve(false)
                })
                request.on('error', () => resolve(false))
                request.end()
            }),
    }
}

export type NginxRouteProbeClient = ReturnType<typeof createNginxRouteProbeClient>
