import type { ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from './error'

type ApiKeyAuthenticator = {
    authenticate: (headers: Headers, scope: ApiKeyScope) => Promise<{ actorId: string; apiKeyId: string; authMethod: 'api-key'; role: string }>
}

type SessionAuthenticator = {
    requireRecentRole: (headers: Headers, allowedRoles: string[], maxAgeMs: number) => Promise<{ role: string; user: { id: string } }>
    requireRole: (headers: Headers, allowedRoles: string[]) => Promise<{ role: string; user: { id: string } }>
}

type AuthenticateScopeOrRoleInput = {
    apiKeyService: ApiKeyAuthenticator
    authService: SessionAuthenticator
    headers: Headers
    recentMaxAgeMs?: number
    roles: string[]
    scope: ApiKeyScope
}

/**
 * Authenticates a request as either an API key (Authorization header present,
 * scope required, key holder's current role must satisfy the same role gate)
 * or a session (recentMaxAgeMs switches to the recent-auth check). The session
 * recent requirement is intentionally replaced by scope possession on the API
 * key path.
 */
export const authenticateScopeOrRole = async ({
    apiKeyService,
    authService,
    headers,
    recentMaxAgeMs,
    roles,
    scope,
}: AuthenticateScopeOrRoleInput) => {
    if (headers.has('authorization')) {
        const key = await apiKeyService.authenticate(headers, scope)
        if (!roles.includes(key.role)) {
            throw createAppError('FORBIDDEN')
        }
        return { actorId: key.actorId, apiKeyId: key.apiKeyId as string | null, authMethod: key.authMethod as 'api-key' | 'session', role: key.role }
    }
    const session =
        recentMaxAgeMs === undefined
            ? await authService.requireRole(headers, roles)
            : await authService.requireRecentRole(headers, roles, recentMaxAgeMs)
    return { actorId: session.user.id, apiKeyId: null, authMethod: 'session' as const, role: session.role }
}

export type AuthenticatedActor = Awaited<ReturnType<typeof authenticateScopeOrRole>>
