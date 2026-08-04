import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import type { ControlService } from '../../service/domain/control/create-control-service'
import { createControlRoute } from './create-control-route'

const BASE_TIME = new Date('2026-08-01T00:00:00.000Z')

const SESSION = {
    role: 'viewer' as const,
    session: {
        createdAt: BASE_TIME,
        expiresAt: new Date(BASE_TIME.getTime() + 3_600_000),
        id: 'session-id',
        token: 'session-token',
        updatedAt: BASE_TIME,
        userId: 'user-viewer',
    },
    user: {
        createdAt: BASE_TIME,
        email: 'viewer@example.com',
        emailVerified: true,
        id: 'user-viewer',
        name: 'Viewer',
        updatedAt: BASE_TIME,
    },
}

const TOKEN_SCOPES: Record<string, ApiKeyScope[]> = {
    'engine-key': [API_KEY_SCOPE.ENGINE_READ],
    'wrong-key': [API_KEY_SCOPE.ARTIFACT_READ],
}

const IMAGE_SUMMARY = {
    createdAt: BASE_TIME.toISOString(),
    id: 'sha256:image-1',
    repoDigests: [],
    repoTags: ['example:1.0.0'],
    sharedSizeBytes: 0,
    sizeBytes: 1_024,
}

const unsupported = (): never => {
    throw createAppError('CONTROL_FAILED')
}

const controlService: ControlService = {
    createContainer: async () => unsupported(),
    createNetwork: async () => unsupported(),
    createVolume: async () => unsupported(),
    executeContainer: async () => unsupported(),
    getContainerChanges: async () => unsupported(),
    getContainerTop: async () => unsupported(),
    getImageRemovalImpact: async () => unsupported(),
    getImages: async () => [IMAGE_SUMMARY],
    getNetworks: async () => unsupported(),
    getPrunePreview: async () => unsupported(),
    getRegistryCredentials: async () => unsupported(),
    getVolumes: async () => unsupported(),
    performContainerAction: async () => unsupported(),
    removeImage: async () => unsupported(),
    removeNetwork: async () => unsupported(),
    removeRegistryCredential: async () => unsupported(),
    removeVolume: async () => unsupported(),
    tagImage: async () => unsupported(),
    upsertRegistryCredential: async () => unsupported(),
    waitContainer: async () => unsupported(),
}

const createTestApp = () =>
    new Hono().route(
        '/api',
        createControlRoute({
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
            auditService: { record: async () => undefined },
            authService: {
                requireRecentRole: async () => SESSION,
                requireRole: async (headers) => {
                    if (!headers.has('cookie')) {
                        throw createAppError('AUTH_REQUIRED')
                    }
                    return SESSION
                },
            },
            controlService,
            operationJobService: { enqueue: async () => unsupported() },
        }),
    )

const requestImages = async (headers: Record<string, string> = {}) => createTestApp().request('/api/images', { headers })

describe('이미지 목록 라우트 인증', () => {
    test('engine:read scope API key 는 200 이고 목록을 반환합니다', async () => {
        const response = await requestImages({ authorization: 'Bearer engine-key' })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ data: [IMAGE_SUMMARY], success: true })
    })

    test('scope 가 없는 API key 는 403 입니다', async () => {
        expect((await requestImages({ authorization: 'Bearer wrong-key' })).status).toBe(403)
    })

    test('세션 요청은 그대로 200 입니다', async () => {
        expect((await requestImages({ cookie: 'session=1' })).status).toBe(200)
    })

    test('미인증 요청은 401 입니다', async () => {
        expect((await requestImages()).status).toBe(401)
    })
})
