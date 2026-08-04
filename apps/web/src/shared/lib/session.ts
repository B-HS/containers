import { cache } from 'react'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { headers } from 'next/headers'
import { getAuthGate } from '@entities/auth/auth.api'

type AuthGate = Awaited<ReturnType<typeof getAuthGate>>
type AuthenticatedGate = Extract<AuthGate, { mode: 'authenticated' }>
export type PanelSession = AuthenticatedGate['session']

type SessionResult =
    | { mode: 'bootstrap' }
    | { mode: 'login' }
    | {
          mode: 'authenticated'
          session: PanelSession
          cookie: string
          canManageApiKeys: boolean
          canManageSecrets: boolean
          canViewAudit: boolean
          isOwner: boolean
      }

export const getSession = cache(async (): Promise<SessionResult> => {
    const requestHeaders = await headers()
    const cookie = requestHeaders.get('cookie') ?? ''
    const authGate = await getAuthGate(API_INTERNAL_URL, cookie)

    if (authGate.mode !== 'authenticated') {
        return { mode: authGate.mode }
    }

    const role = authGate.session.role

    return {
        mode: 'authenticated',
        session: authGate.session,
        cookie,
        canManageApiKeys: ['owner', 'admin'].includes(role),
        canManageSecrets: ['owner', 'admin'].includes(role),
        canViewAudit: ['owner', 'admin', 'viewer', 'auditor'].includes(role),
        isOwner: role === 'owner',
    }
})
