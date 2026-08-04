import type { AppType } from '@containers/api/app'
import { hc } from 'hono/client'
import { z } from 'zod'

const bootstrapStatusSchema = z.object({ data: z.object({ required: z.boolean() }), success: z.literal(true) })

const sessionDataSchema = z.object({
    role: z.enum(['admin', 'auditor', 'operator', 'owner', 'viewer']),
    user: z.object({ id: z.string(), name: z.string() }).passthrough(),
})

const sessionSchema = z.object({ data: sessionDataSchema, success: z.literal(true) })

export const getAuthGate = async (baseUrl: string, cookie: string) => {
    const client = hc<AppType>(baseUrl)
    const bootstrapResponse = await client.api.bootstrap.status.$get({})

    if (!bootstrapResponse.ok) {
        throw new Error(`Bootstrap 상태 조회 실패: ${bootstrapResponse.status}`)
    }

    const bootstrap = bootstrapStatusSchema.parse(await bootstrapResponse.json())

    if (bootstrap.data.required) {
        return { mode: 'bootstrap' as const }
    }

    const sessionResponse = await client.api.session.$get({}, { headers: { cookie } })

    if (!sessionResponse.ok) {
        return { mode: 'login' as const }
    }

    const session = sessionSchema.parse(await sessionResponse.json()).data

    return { mode: 'authenticated' as const, session }
}
