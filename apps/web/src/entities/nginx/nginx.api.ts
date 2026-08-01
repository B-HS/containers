import type { AppType } from '@containers/api/app'
import { nginxConfigStateSchema, nginxProxyRouteListSchema } from '@containers/contracts/nginx'
import { hc } from 'hono/client'
import { z } from 'zod'

const nginxConfigResponseSchema = z.object({ data: nginxConfigStateSchema, success: z.literal(true) })
const nginxRoutesResponseSchema = z.object({ data: nginxProxyRouteListSchema, success: z.literal(true) })

export const getNginxStatus = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const response = await client.api.nginx.status.$get({}, { headers: { cookie } })

    if (!response.ok) {
        throw new Error(`Nginx 상태 조회 실패: ${response.status}`)
    }

    return (await response.json()).data
}

export const getNginxConfig = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/nginx/config`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`Nginx 설정 조회 실패: ${response.status}`)
    }
    return nginxConfigResponseSchema.parse(await response.json()).data
}

export const getNginxRoutes = async (baseUrl: string, cookie: string) => {
    const response = await fetch(`${baseUrl}/api/nginx/routes`, { headers: { cookie } })
    if (!response.ok) {
        throw new Error(`Nginx 프록시 라우트 조회 실패: ${response.status}`)
    }
    return nginxRoutesResponseSchema.parse(await response.json()).data
}
