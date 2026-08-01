import type { AppType } from '@containers/api/app'
import { hc } from 'hono/client'

export const getAuthGate = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const bootstrapResponse = await client.api.bootstrap.status.$get()

    if (!bootstrapResponse.ok) {
        throw new Error(`Bootstrap 상태 조회 실패: ${bootstrapResponse.status}`)
    }

    const bootstrap = await bootstrapResponse.json()

    if (bootstrap.data.required) {
        return { mode: 'bootstrap' as const }
    }

    const sessionResponse = await client.api.session.$get({}, { headers: { cookie } })

    if (sessionResponse.status === 401) {
        return { mode: 'login' as const }
    }

    const session = await sessionResponse.json()
    return { mode: 'authenticated' as const, session: session.data }
}
