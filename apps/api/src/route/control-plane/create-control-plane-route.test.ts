import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import { createControlPlaneRoute } from './create-control-plane-route'

const BASE_TIME = new Date('2026-08-01T00:00:00.000Z')
const STATUS_PATH = '/api/control-plane/status'

const SESSION = {
    role: 'owner' as const,
    session: {
        createdAt: BASE_TIME,
        expiresAt: new Date(BASE_TIME.getTime() + 3_600_000),
        id: 'session-id',
        token: 'session-token',
        updatedAt: BASE_TIME,
        userId: 'user-owner',
    },
    user: {
        createdAt: BASE_TIME,
        email: 'owner@example.com',
        emailVerified: true,
        id: 'user-owner',
        name: 'Owner',
        updatedAt: BASE_TIME,
    },
}

const TOKEN_SCOPES: Record<string, ApiKeyScope[]> = {
    'plane-key': [API_KEY_SCOPE.CONTROL_PLANE_READ],
    'wrong-key': [API_KEY_SCOPE.ARTIFACT_READ],
}

const STATUS = {
    activeJobCount: 0,
    databaseIntegrity: { control: 'ok' },
    lastBackupAt: null,
    maintenance: { actorId: null, enabled: false, jobId: null, reason: null, startedAt: null },
    migrations: { applied: [], pending: [] },
    version: '0.1.0',
}

const createTestApp = () =>
    new Hono().route(
        '/api',
        createControlPlaneRoute({
            apiKeyService: {
                authenticate: async (headers, requiredScope) => {
                    const token = headers.get('authorization')?.replace('Bearer ', '') ?? ''
                    const scopes = TOKEN_SCOPES[token]
                    if (!scopes) {
                        throw createAppError('AUTH_REQUIRED')
                    }
                    if (!scopes.includes(requiredScope)) {
                        throw createAppError('FORBIDDEN')
                    }
                    return { actorId: 'user-api', apiKeyId: 'api-key-id', authMethod: 'api-key' as const }
                },
            },
            authService: {
                requireRole: async (headers) => {
                    if (!headers.has('cookie')) {
                        throw createAppError('AUTH_REQUIRED')
                    }
                    return SESSION
                },
            },
            controlPlaneStatusService: { getStatus: async () => STATUS },
        }),
    )

const status = async (headers: Record<string, string> = {}) => (await createTestApp().request(STATUS_PATH, { headers })).status

describe('control plane 상태 라우트 인증', () => {
    test('control-plane:read scope API key 는 200 입니다', async () => {
        expect(await status({ authorization: 'Bearer plane-key' })).toBe(200)
    })

    test('scope 가 없는 API key 는 403 입니다', async () => {
        expect(await status({ authorization: 'Bearer wrong-key' })).toBe(403)
    })

    test('세션 요청은 그대로 200 입니다', async () => {
        expect(await status({ cookie: 'session=1' })).toBe(200)
    })

    test('미인증 요청은 401 입니다', async () => {
        expect(await status()).toBe(401)
    })
})
