import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import { createDeploymentManifestRoute } from './create-deployment-manifest-route'

const REQUEST_ID = 'req-manifest'
const BASE_TIME = new Date('2026-08-01T00:00:00.000Z')
const MANIFEST_ID = '22222222-2222-4222-8222-222222222222'
const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`

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
    'read-key': [API_KEY_SCOPE.DEPLOYMENT_READ],
    'write-key': [API_KEY_SCOPE.DEPLOYMENT_READ, API_KEY_SCOPE.DEPLOYMENT_WRITE],
    'wrong-key': [API_KEY_SCOPE.ARTIFACT_READ],
}

const MANIFEST = {
    command: [],
    createdAt: BASE_TIME.toISOString(),
    createdBy: 'user-owner',
    entrypoint: [],
    environmentKeys: [],
    healthcheck: { intervalSeconds: 10, path: '/health', retries: 5, startPeriodSeconds: 10, timeoutSeconds: 3 },
    id: MANIFEST_ID,
    imageDigest: IMAGE_DIGEST,
    internalPort: 3000,
    memoryBytes: 536_870_912,
    name: 'sample-app',
    nanoCpus: 1_000_000_000,
    network: 'containers_edge',
    pidsLimit: 256,
    protocol: 'http' as const,
    restartPolicy: 'unless-stopped' as const,
    rollout: { observationSeconds: 60, rollbackRetentionSeconds: 86_400 },
    route: { hostname: 'sample.example.com', path: '/', stripPrefix: false },
    secrets: [],
    updatedAt: BASE_TIME.toISOString(),
    version: '1.0.0',
    volumes: [],
    runtime: { capabilities: [], profile: 'standard' as const, writablePaths: [] },
}

const MANIFEST_INPUT = {
    healthcheck: { path: '/health' },
    imageDigest: IMAGE_DIGEST,
    internalPort: 3000,
    name: 'sample-app',
    rollout: {},
    route: { hostname: 'sample.example.com' },
    version: '1.0.0',
}

const listCalls: { name?: string | undefined; version?: string | undefined }[] = []

const createTestApp = (createBehavior: 'conflict' | 'created' | 'reused') =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route(
            '/api',
            createDeploymentManifestRoute({
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
                        return { actorId: 'user-api', apiKeyId: 'api-key-id', authMethod: 'api-key' as const, role: 'owner' }
                    },
                },
                auditService: { record: async () => undefined },
                authService: {
                    requireRecentRole: async (headers) => {
                        if (!headers.has('cookie')) {
                            throw createAppError('AUTH_REQUIRED')
                        }
                        return SESSION
                    },
                    requireRole: async (headers) => {
                        if (!headers.has('cookie')) {
                            throw createAppError('AUTH_REQUIRED')
                        }
                        return SESSION
                    },
                },
                deploymentManifestService: {
                    create: async () => {
                        if (createBehavior === 'conflict') {
                            throw createAppError('DEPLOYMENT_MANIFEST_VERSION_EXISTS')
                        }
                        return { manifest: MANIFEST, reused: createBehavior === 'reused' }
                    },
                    get: async () => MANIFEST,
                    remove: async () => MANIFEST,
                    list: async (filter = {}) => {
                        listCalls.push(filter)
                        return [MANIFEST]
                    },
                },
            }),
        )

const postManifest = async (headers: Record<string, string>, behavior: 'conflict' | 'created' | 'reused' = 'created') =>
    createTestApp(behavior).request('/api/deployment-manifests', {
        body: JSON.stringify(MANIFEST_INPUT),
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
    })

const getManifests = async (headers: Record<string, string>, query = '') =>
    createTestApp('created').request(`/api/deployment-manifests${query}`, { headers })

describe('배포 manifest 라우트', () => {
    test('deployment:read scope·세션은 200, scope 없는 key 는 403, 미인증은 401 입니다', async () => {
        const [withScope, withoutScope, withSession, anonymous] = await Promise.all([
            getManifests({ authorization: 'Bearer read-key' }),
            getManifests({ authorization: 'Bearer wrong-key' }),
            getManifests({ cookie: 'session=1' }),
            getManifests({}),
        ])

        expect([withScope.status, withoutScope.status, withSession.status, anonymous.status]).toEqual([200, 403, 200, 401])
    })

    test('name·version 조회 파라미터를 서비스로 전달합니다', async () => {
        listCalls.splice(0)
        await getManifests({ authorization: 'Bearer read-key' }, '?name=sample-app&version=1.0.0')

        expect(listCalls).toEqual([{ name: 'sample-app', version: '1.0.0' }])
    })

    test('새 manifest 는 201, 동일 payload 재요청은 200 입니다', async () => {
        const created = await postManifest({ authorization: 'Bearer write-key' })
        const reused = await postManifest({ authorization: 'Bearer write-key' }, 'reused')

        expect(created.status).toBe(201)
        expect(reused.status).toBe(200)
    })

    test('같은 name·version 에 다른 내용이면 409 입니다', async () => {
        const response = await postManifest({ authorization: 'Bearer write-key' }, 'conflict')

        expect(response.status).toBe(409)
    })

    test('생성은 deployment:write scope 가 필요하고 미인증은 401 입니다', async () => {
        const [readOnly, anonymous] = await Promise.all([postManifest({ authorization: 'Bearer read-key' }), postManifest({})])

        expect([readOnly.status, anonymous.status]).toEqual([403, 401])
    })

    test('manifest 삭제는 세션 없이 거부하고 세션이 있으면 manifest 를 돌려준다', async () => {
        const app = createTestApp('created')
        const unauthorized = await app.request(`/api/deployment-manifests/${MANIFEST.id}`, { method: 'DELETE' })
        const response = await app.request(`/api/deployment-manifests/${MANIFEST.id}`, { headers: { cookie: 'session=1' }, method: 'DELETE' })

        expect(unauthorized.status).toBe(401)
        expect(response.status).toBe(200)
        expect((await response.json()).data.id).toBe(MANIFEST.id)
    })
})
