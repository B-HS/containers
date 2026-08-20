import type { ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from './error'

type ApiKeyAuthenticator = {
    authenticate: (headers: Headers, scope: ApiKeyScope) => Promise<{ actorId: string; apiKeyId: string; authMethod: 'api-key'; role: string }>
}

type SessionAuthenticator = {
    requireRole: (headers: Headers, allowedRoles: string[]) => Promise<{ role: string; user: { id: string } }>
}

type AuthenticateScopeOrRoleInput = {
    apiKeyService: ApiKeyAuthenticator
    authService: SessionAuthenticator
    headers: Headers
    roles: string[]
    scope: ApiKeyScope
}

/**
 * Authenticates a request as either an API key (Authorization header present,
 * scope required, key holder's current role must satisfy the same role gate)
 * or a session with the required role.
 */
export const authenticateScopeOrRole = async ({ apiKeyService, authService, headers, roles, scope }: AuthenticateScopeOrRoleInput) => {
    if (headers.has('authorization')) {
        const key = await apiKeyService.authenticate(headers, scope)
        if (!roles.includes(key.role)) {
            throw createAppError('FORBIDDEN')
        }
        return { actorId: key.actorId, apiKeyId: key.apiKeyId as string | null, authMethod: key.authMethod as 'api-key' | 'session', role: key.role }
    }
    const session = await authService.requireRole(headers, roles)
    return { actorId: session.user.id, apiKeyId: null, authMethod: 'session' as const, role: session.role }
}

export type AuthenticatedActor = Awaited<ReturnType<typeof authenticateScopeOrRole>>
