import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { createAppError } from '../../lib/error'
import { createDeploymentStackReleaseRoute } from './create-deployment-stack-release-route'

const REQUEST_ID = 'req-stack-release'
const BASE_TIME = new Date('2026-08-06T00:00:00.000Z')
const STACK_ID = '33333333-3333-4333-8333-333333333333'
const STACK_RELEASE_ID = '88888888-8888-4888-8888-888888888888'

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

const STACK_RELEASE = {
    createdAt: BASE_TIME.toISOString(),
    createdBy: 'user-owner',
    failureCode: null,
    finishedAt: null,
    id: STACK_RELEASE_ID,
    releaseIds: [],
    stackId: STACK_ID,
    status: 'releasing' as const,
    updatedAt: BASE_TIME.toISOString(),
}

const enqueued: { kind: string; payload: Record<string, unknown>; uniqueResourceKey: string | undefined }[] = []

const createTestApp = (createBehavior: 'created' | 'in-progress') =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route(
            '/api',
            createDeploymentStackReleaseRoute({
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
                deploymentStackReleaseService: {
                    create: async () => {
                        if (createBehavior === 'in-progress') {
                            throw createAppError('DEPLOYMENT_STACK_RELEASE_IN_PROGRESS')
                        }
                        return STACK_RELEASE
                    },
                    get: async () => STACK_RELEASE,
                    list: async () => [STACK_RELEASE],
                },
                operationJobService: {
                    enqueue: async (input) => {
                        enqueued.push({ kind: input.kind, payload: input.payload, uniqueResourceKey: input.uniqueResourceKey })
                        return {
                            attempt: 0,
                            cancelRequestedAt: null,
                            createdAt: BASE_TIME.toISOString(),
                            createdBy: 'user-owner',
                            failureCode: null,
                            finishedAt: null,
                            heartbeatAt: null,
                            id: '99999999-9999-4999-8999-999999999999',
                            kind: input.kind,
                            maxAttempts: 1,
                            payload: input.payload,
                            progressStep: null,
                            resourceKey: input.uniqueResourceKey ?? null,
                            result: null,
                            scheduledAt: BASE_TIME.toISOString(),
                            startedAt: null,
                            status: 'queued' as const,
                            updatedAt: BASE_TIME.toISOString(),
                        }
                    },
                },
            }),
        )

const postRelease = async (headers: Record<string, string>, behavior: 'created' | 'in-progress' = 'created') =>
    createTestApp(behavior).request(`/api/deployment-stacks/${STACK_ID}/releases`, { headers, method: 'POST' })

const getStackReleases = async (headers: Record<string, string>, path = '') =>
    createTestApp('created').request(`/api/deployment-stack-releases${path}`, { headers })

describe('compose 스택 배포 라우트', () => {
    test('목록과 상세는 read scope·세션이면 200, 미인증은 401 이다', async () => {
        const [withScope, withSession, anonymous, detail] = await Promise.all([
            getStackReleases({ authorization: 'Bearer read-key' }),
            getStackReleases({ cookie: 'session=1' }),
            getStackReleases({}),
            getStackReleases({ authorization: 'Bearer read-key' }, `/${STACK_RELEASE_ID}`),
        ])

        expect([withScope.status, withSession.status, anonymous.status, detail.status]).toEqual([200, 200, 401, 200])
    })

    test('배포 시작은 202 로 job 과 스택 배포를 함께 돌려준다', async () => {
        enqueued.splice(0)
        const response = await postRelease({ authorization: 'Bearer write-key' })
        const body = await response.json()

        expect(response.status).toBe(202)
        expect(body.data.stackRelease).toEqual(STACK_RELEASE)
        expect(enqueued).toEqual([
            {
                kind: OPERATION_JOB_KIND.DEPLOY_STACK_RELEASE,
                payload: { stackReleaseId: STACK_RELEASE_ID },
                uniqueResourceKey: STACK_RELEASE_ID,
            },
        ])
    })

    test('배포 시작은 write scope 가 필요하고 미인증은 401 이다', async () => {
        const [readOnly, anonymous] = await Promise.all([postRelease({ authorization: 'Bearer read-key' }), postRelease({})])

        expect([readOnly.status, anonymous.status]).toEqual([403, 401])
    })

    test('같은 스택 배포가 진행 중이면 409 다', async () => {
        const response = await postRelease({ authorization: 'Bearer write-key' }, 'in-progress')

        expect(response.status).toBe(409)
    })
})
