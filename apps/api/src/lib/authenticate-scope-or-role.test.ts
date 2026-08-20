import { describe, expect, test } from 'bun:test'
import { API_KEY_SCOPE } from '@containers/contracts/api-key'
import { authenticateScopeOrRole } from './authenticate-scope-or-role'
import { createAppError } from './error'

const OWNER_SESSION = { role: 'owner', user: { id: 'user-session' } }

const createAuthServiceStub = (calls: string[]) => ({
    requireRecentRole: async () => {
        calls.push('recent')
        return OWNER_SESSION
    },
    requireRole: async () => {
        calls.push('role')
        return OWNER_SESSION
    },
})

const keyActor = (role: string) => ({ actorId: 'user-key', apiKeyId: 'key-id', authMethod: 'api-key' as const, role })

describe('authenticateScopeOrRole', () => {
    test('Authorization 헤더가 있으면 API 키 경로로 인증하고 actor 를 정규화한다', async () => {
        const calls: string[] = []
        const actor = await authenticateScopeOrRole({
            apiKeyService: { authenticate: async () => keyActor('admin') },
            authService: createAuthServiceStub(calls),
            headers: new Headers({ authorization: 'Bearer ctk_x' }),
            roles: ['owner', 'admin'],
            scope: API_KEY_SCOPE.CONTAINER_WRITE,
        })
        expect(actor).toEqual({ actorId: 'user-key', apiKeyId: 'key-id', authMethod: 'api-key', role: 'admin' })
        expect(calls).toEqual([])
    })

    test('키 보유자의 현재 role 이 요구 role 에 없으면 FORBIDDEN 이다', async () => {
        await expect(
            authenticateScopeOrRole({
                apiKeyService: { authenticate: async () => keyActor('operator') },
                authService: createAuthServiceStub([]),
                headers: new Headers({ authorization: 'Bearer ctk_x' }),
                roles: ['owner', 'admin'],
                scope: API_KEY_SCOPE.CONTAINER_WRITE,
            }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    test('세션 경로는 recentMaxAgeMs 유무로 recent 검사를 고른다', async () => {
        const calls: string[] = []
        const plain = await authenticateScopeOrRole({
            apiKeyService: {
                authenticate: async () => {
                    throw createAppError('AUTH_REQUIRED')
                },
            },
            authService: createAuthServiceStub(calls),
            headers: new Headers(),
            roles: ['owner'],
            scope: API_KEY_SCOPE.ENGINE_READ,
        })
        await authenticateScopeOrRole({
            apiKeyService: {
                authenticate: async () => {
                    throw createAppError('AUTH_REQUIRED')
                },
            },
            authService: createAuthServiceStub(calls),
            headers: new Headers(),
            recentMaxAgeMs: 1_000,
            roles: ['owner'],
            scope: API_KEY_SCOPE.ENGINE_READ,
        })
        expect(plain).toEqual({ actorId: 'user-session', apiKeyId: null, authMethod: 'session', role: 'owner' })
        expect(calls).toEqual(['role', 'recent'])
    })
})
