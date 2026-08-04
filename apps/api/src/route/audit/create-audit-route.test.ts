import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { createControlDatabase, type ControlDatabase } from '@containers/db-schema/database'
import { auditLog, user } from '@containers/db-schema/schema'
import { buildAuditServiceDb } from '../../compose/compose-audit'
import { createAppError } from '../../lib/error'
import { createAuditService } from '../../service/domain/audit/create-audit-service'
import { createAuditRoute } from './create-audit-route'

const REQUEST_ID = 'req-audit'
const SEED_COUNT = 7
const BASE_TIME_MS = Date.parse('2026-01-01T00:00:00.000Z')
const HOUR_MS = 60 * 60 * 1_000

type AuditPageBody = {
    data: { operation: string; targetId: string | null }[]
    pagination: { limit: number; page: number; total: number; totalPages: number }
}

const AUTHORIZED_SESSION = {
    role: 'owner' as const,
    session: {
        createdAt: new Date(BASE_TIME_MS),
        expiresAt: new Date(BASE_TIME_MS + HOUR_MS),
        id: 'test-session',
        token: 'test-token',
        updatedAt: new Date(BASE_TIME_MS),
        userId: 'user-owner',
    },
    user: {
        createdAt: new Date(BASE_TIME_MS),
        email: 'owner@example.com',
        emailVerified: true,
        id: 'user-owner',
        name: 'Owner',
        updatedAt: new Date(BASE_TIME_MS),
    },
}

const seed = async (db: ControlDatabase) => {
    await db.insert(user).values([
        {
            createdAt: new Date(BASE_TIME_MS),
            email: 'owner@example.com',
            emailVerified: true,
            id: 'user-owner',
            name: 'Owner',
            updatedAt: new Date(BASE_TIME_MS),
        },
        {
            createdAt: new Date(BASE_TIME_MS),
            email: 'auditor@example.com',
            emailVerified: true,
            id: 'user-auditor',
            name: 'Auditor',
            updatedAt: new Date(BASE_TIME_MS),
        },
    ])
    await db.insert(auditLog).values(
        Array.from({ length: SEED_COUNT }, (_unused, index) => ({
            actorId: index % 2 === 0 ? 'user-owner' : 'user-auditor',
            authMethod: 'session',
            createdAt: new Date(BASE_TIME_MS + index * HOUR_MS),
            detail: null,
            id: `audit-${index}`,
            operation: index % 2 === 0 ? 'container.start' : 'container.stop',
            requestId: `request-${index}`,
            result: index === 0 ? 'failure' : 'success',
            sourceIp: '203.0.113.5',
            targetId: `container-${index}`,
            targetType: index < 5 ? 'container' : 'volume',
        })),
    )
}

const createTestApp = (db: ControlDatabase, allowed: boolean) =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .route(
            '/api',
            createAuditRoute({
                auditService: createAuditService({
                    archiveRoot: join(tmpdir(), 'containers-audit-archive-test'),
                    db: buildAuditServiceDb(db),
                    now: () => new Date(BASE_TIME_MS),
                    retentionDays: 365,
                }),
                authService: {
                    requireRole: async () => {
                        if (!allowed) {
                            throw createAppError('FORBIDDEN')
                        }
                        return AUTHORIZED_SESSION
                    },
                },
            }),
        )

describe('감사 로그 라우트', () => {
    const directory = mkdtempSync(join(tmpdir(), 'containers-audit-'))
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })

    beforeAll(async () => {
        await seed(database.db)
    })

    afterAll(async () => {
        database.sqlite.close()
        await rm(directory, { force: true, recursive: true })
    })

    const request = async (query: string) => {
        const response = await createTestApp(database.db, true).request(`/api/audit${query}`)
        return { body: (await response.json()) as AuditPageBody, status: response.status }
    }

    test('최신순으로 페이지네이션 봉투를 반환합니다', async () => {
        const { body, status } = await request('?limit=3&page=1')

        expect(status).toBe(200)
        expect(body.data).toHaveLength(3)
        expect(body.data[0]?.targetId).toBe(`container-${SEED_COUNT - 1}`)
        expect(body.pagination).toEqual({ limit: 3, page: 1, total: SEED_COUNT, totalPages: 3 })
    })

    test('두 번째 페이지는 offset 만큼 건너뜁니다', async () => {
        const { body } = await request('?limit=3&page=2')

        expect(body.data.map((event) => event.targetId)).toEqual(['container-3', 'container-2', 'container-1'])
        expect(body.pagination.page).toBe(2)
    })

    test('범위를 벗어난 페이지는 빈 목록과 total 을 유지합니다', async () => {
        const { body } = await request('?limit=3&page=9')

        expect(body.data).toEqual([])
        expect(body.pagination.total).toBe(SEED_COUNT)
        expect(body.pagination.totalPages).toBe(3)
    })

    test('operation·result·targetType 필터를 조합해 거릅니다', async () => {
        const { body } = await request('?operation=container.start&result=success&targetType=container')

        expect(body.pagination.total).toBe(2)
        expect(body.data.map((event) => event.targetId)).toEqual(['container-4', 'container-2'])
    })

    test('actorEmail 은 부분 일치, targetId 는 정확히 일치합니다', async () => {
        const [byActor, byTarget] = await Promise.all([request('?actorEmail=auditor@'), request('?targetId=container-6')])

        expect(byActor.body.pagination.total).toBe(3)
        expect(byTarget.body.pagination.total).toBe(1)
        expect(byTarget.body.data[0]?.operation).toBe('container.start')
    })

    test('기간 범위로 거릅니다', async () => {
        const from = new Date(BASE_TIME_MS + HOUR_MS).toISOString()
        const to = new Date(BASE_TIME_MS + 3 * HOUR_MS).toISOString()
        const { body } = await request(`?from=${from}&to=${to}`)

        expect(body.data.map((event) => event.targetId)).toEqual(['container-3', 'container-2', 'container-1'])
    })

    test('from 이 to 보다 이후이면 400 으로 거부합니다', async () => {
        const { status } = await request(`?from=${new Date(BASE_TIME_MS + HOUR_MS).toISOString()}&to=${new Date(BASE_TIME_MS).toISOString()}`)

        expect(status).toBe(400)
    })

    test('limit 상한을 넘기면 400 으로 거부합니다', async () => {
        const { status } = await request('?limit=500')

        expect(status).toBe(400)
    })

    test('권한이 없는 role 은 403 입니다', async () => {
        const response = await createTestApp(database.db, false).request('/api/audit')

        expect(response.status).toBe(403)
    })
})
