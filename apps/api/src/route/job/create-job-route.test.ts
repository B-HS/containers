import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import { createJobRoute } from './create-job-route'

const REQUEST_ID = 'req-job'
const JOB_ID = '11111111-1111-4111-8111-111111111111'
const BASE_TIME = new Date('2026-08-01T00:00:00.000Z')

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
    'read-key': [API_KEY_SCOPE.JOB_READ],
    'write-key': [API_KEY_SCOPE.JOB_READ, API_KEY_SCOPE.JOB_WRITE],
    'wrong-key': [API_KEY_SCOPE.ARTIFACT_READ],
}

const JOB = {
    attempt: 0,
    cancelRequestedAt: null,
    createdAt: BASE_TIME.toISOString(),
    createdBy: 'user-owner',
    failureCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: JOB_ID,
    kind: 'deploy.release' as const,
    maxAttempts: 1,
    payload: {},
    progressStep: null,
    resourceKey: null,
    result: null,
    scheduledAt: BASE_TIME.toISOString(),
    startedAt: null,
    status: 'queued' as const,
    updatedAt: BASE_TIME.toISOString(),
}

const BACKUP_SCHEDULE = {
    intervalHours: 24,
    lastFailureAt: null,
    lastFailureCode: null,
    lastSuccessAt: null,
    nextRunAt: BASE_TIME.toISOString(),
}

const auditRecords: { operation: string; result: string }[] = []

const createTestApp = () =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route(
            '/api',
            createJobRoute({
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
                auditService: {
                    record: async (record) => {
                        auditRecords.push({ operation: record.operation, result: record.result })
                    },
                },
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
                backupScheduleService: { getSchedule: async () => BACKUP_SCHEDULE },
                operationJobService: {
                    get: async () => JOB,
                    list: async () => [JOB],
                    listEvents: async () => [],
                    requestCancel: async () => ({ ...JOB, status: 'cancelled' as const }),
                },
            }),
        )

const request = async (path: string, headers: Record<string, string> = {}, method = 'GET') => createTestApp().request(path, { headers, method })

const READ_PATHS = ['/api/jobs', '/api/jobs/backup-schedule', `/api/jobs/${JOB_ID}`, `/api/jobs/${JOB_ID}/events`]

describe('작업 라우트 인증', () => {
    test('job:read scope API key 는 읽기 엔드포인트에서 200 입니다', async () => {
        const statuses = await Promise.all(READ_PATHS.map(async (path) => (await request(path, { authorization: 'Bearer read-key' })).status))

        expect(statuses).toEqual([200, 200, 200, 200])
    })

    test('scope 가 없는 API key 는 403 입니다', async () => {
        const statuses = await Promise.all(READ_PATHS.map(async (path) => (await request(path, { authorization: 'Bearer wrong-key' })).status))

        expect(statuses).toEqual([403, 403, 403, 403])
    })

    test('세션 요청은 그대로 200 입니다', async () => {
        const statuses = await Promise.all(READ_PATHS.map(async (path) => (await request(path, { cookie: 'session=1' })).status))

        expect(statuses).toEqual([200, 200, 200, 200])
    })

    test('미인증 요청은 401 입니다', async () => {
        const statuses = await Promise.all(READ_PATHS.map(async (path) => (await request(path)).status))

        expect(statuses).toEqual([401, 401, 401, 401])
    })

    test('취소는 job:write scope 만 허용하고 감사 로그를 남깁니다', async () => {
        auditRecords.splice(0)
        const allowed = await request(`/api/jobs/${JOB_ID}/cancel`, { authorization: 'Bearer write-key' }, 'POST')
        const denied = await request(`/api/jobs/${JOB_ID}/cancel`, { authorization: 'Bearer read-key' }, 'POST')
        const anonymous = await request(`/api/jobs/${JOB_ID}/cancel`, {}, 'POST')

        expect(allowed.status).toBe(200)
        expect(denied.status).toBe(403)
        expect(anonymous.status).toBe(401)
        expect(auditRecords).toEqual([
            { operation: 'job.cancel', result: 'attempt' },
            { operation: 'job.cancel', result: 'success' },
        ])
    })
})
