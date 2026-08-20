import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import { createDeploymentStackRoute } from './create-deployment-stack-route'

const REQUEST_ID = 'req-stack'
const BASE_TIME = new Date('2026-08-06T00:00:00.000Z')
const STACK_ID = '33333333-3333-4333-8333-333333333333'
const MANIFEST_ID = '44444444-4444-4444-8444-444444444444'

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
}

const STACK = {
    createdAt: BASE_TIME.toISOString(),
    createdBy: 'user-owner',
    id: STACK_ID,
    manifestIds: [MANIFEST_ID],
    name: 'shop',
    serviceOrder: ['app'],
    updatedAt: BASE_TIME.toISOString(),
    version: '1.0.0',
}

const PREVIEW = { ignored: [], order: ['app'], services: [] }

const STACK_INPUT = { compose: 'services:\n  app:\n    image: app:1.0.0\n    expose: ["8080"]\n', name: 'shop', version: '1.0.0' }

const createTestApp = (createBehavior: 'created' | 'rejected') =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route(
            '/api',
            createDeploymentStackRoute({
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
                deploymentStackService: {
                    create: async () => {
                        if (createBehavior === 'rejected') {
                            throw createAppError('DEPLOYMENT_STACK_REJECTED', undefined, {
                                rejections: [{ detail: 'TOKEN 값을 그대로 담을 수 없다.', rule: 'plaintext-environment', service: 'app' }],
                            })
                        }
                        return STACK
                    },
                    get: async () => STACK,
                    list: async () => [STACK],
                    remove: async () => STACK,
                    preview: async () => PREVIEW,
                },
            }),
        )

const postStack = async (headers: Record<string, string>, behavior: 'created' | 'rejected' = 'created') =>
    createTestApp(behavior).request('/api/deployment-stacks', {
        body: JSON.stringify(STACK_INPUT),
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
    })

const postPreview = async (headers: Record<string, string>) =>
    createTestApp('created').request('/api/deployment-stacks/preview', {
        body: JSON.stringify(STACK_INPUT),
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
    })

const getStacks = async (headers: Record<string, string>, path = '') => createTestApp('created').request(`/api/deployment-stacks${path}`, { headers })

describe('compose 스택 라우트', () => {
    test('목록과 상세는 deployment:read scope·세션이면 200, 미인증은 401 이다', async () => {
        const [withScope, withSession, anonymous, detail] = await Promise.all([
            getStacks({ authorization: 'Bearer read-key' }),
            getStacks({ cookie: 'session=1' }),
            getStacks({}),
            getStacks({ authorization: 'Bearer read-key' }, `/${STACK_ID}`),
        ])

        expect([withScope.status, withSession.status, anonymous.status, detail.status]).toEqual([200, 200, 401, 200])
    })

    test('미리보기는 저장 없이 변환 결과를 돌려주고 write scope 를 요구한다', async () => {
        const [allowed, readOnly, anonymous] = await Promise.all([
            postPreview({ authorization: 'Bearer write-key' }),
            postPreview({ authorization: 'Bearer read-key' }),
            postPreview({}),
        ])

        expect([allowed.status, readOnly.status, anonymous.status]).toEqual([200, 403, 401])
        expect(await allowed.json()).toEqual({ data: PREVIEW, success: true })
    })

    test('스택 생성은 201 이고 write scope 가 필요하다', async () => {
        const [created, readOnly, anonymous] = await Promise.all([
            postStack({ authorization: 'Bearer write-key' }),
            postStack({ authorization: 'Bearer read-key' }),
            postStack({}),
        ])

        expect([created.status, readOnly.status, anonymous.status]).toEqual([201, 403, 401])
        expect(await created.json()).toEqual({ data: STACK, success: true })
    })

    test('거부된 compose 는 400 으로 어느 서비스의 무엇이 문제인지 함께 돌려준다', async () => {
        const response = await postStack({ authorization: 'Bearer write-key' }, 'rejected')
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.error.code).toBe('DEPLOYMENT_STACK_REJECTED')
        expect(body.error.details.rejections).toEqual([{ detail: 'TOKEN 값을 그대로 담을 수 없다.', rule: 'plaintext-environment', service: 'app' }])
    })

    test('스택 삭제는 세션 없이 거부하고 세션이 있으면 스택을 돌려준다', async () => {
        const app = createTestApp('created')
        const unauthorized = await app.request(`/api/deployment-stacks/${STACK.id}`, { method: 'DELETE' })
        const response = await app.request(`/api/deployment-stacks/${STACK.id}`, { headers: { cookie: 'session=1' }, method: 'DELETE' })

        expect(unauthorized.status).toBe(401)
        expect(response.status).toBe(200)
        expect((await response.json()).data.id).toBe(STACK.id)
    })
})
