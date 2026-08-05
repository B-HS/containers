import { describe, expect, test } from 'bun:test'
import { nginxConfigApplySchema, type NginxProxyRoute } from '@containers/contracts/nginx'
import { isAppError } from '../../../lib/error'
import { createNginxProxyRouteService, renderNginxProxyRoutes, type NginxProxyRouteServiceDb } from './create-nginx-proxy-route-service'

const BASE_CONFIG = "events {} http { map $http_upgrade $connection_upgrade { default upgrade; '' close; } resolver 127.0.0.11; }"

const route = (values: Partial<NginxProxyRoute> = {}): NginxProxyRoute => ({
    bodySizeMegabytes: 64,
    createdAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
    hostname: 'app.example.com',
    id: '01958c26-65b5-7c22-9254-03b914e61cc5',
    path: '/',
    pathMode: 'prefix',
    protocol: 'http',
    stripPrefix: false,
    targetContainer: 'example-app',
    targetPort: 3000,
    timeoutSeconds: 60,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...values,
})

describe('Nginx 구조화 route renderer', () => {
    test('hostname 순서와 무관하게 deterministic config를 생성합니다', () => {
        const first = route()
        const second = route({ hostname: 'api.example.com', id: '01958c26-65b5-7c22-9254-03b914e61cc6', targetPort: 8080 })

        expect(renderNginxProxyRoutes(BASE_CONFIG, [first, second])).toBe(renderNginxProxyRoutes(BASE_CONFIG, [second, first]))
    })

    test('이전 managed block을 교체하고 관리 header를 upstream에 전달하지 않습니다', () => {
        const first = renderNginxProxyRoutes(BASE_CONFIG, [route()])
        const second = renderNginxProxyRoutes(first, [route({ protocol: 'websocket', targetPort: 8080 })])

        expect(second.match(/containers-routes:start/g)).toHaveLength(1)
        expect(second).toContain('proxy_set_header Cookie "";')
        expect(second).toContain('proxy_set_header Authorization "";')
        expect(second).toContain('proxy_set_header Upgrade $http_upgrade;')
        expect(second).toContain('example-app:8080')
        expect(second).not.toContain('example-app:3000')
        expect(second.match(/location \^~ \/ /g)).toHaveLength(1)
        expect(second).not.toContain('location / { return 404; }')
    })
})

const APPLIED_SHA256 = 'b'.repeat(64)
const INITIAL_SHA256 = 'a'.repeat(64)
const NOW = new Date('2026-01-01T00:00:00.000Z')

type NginxRouteRow = Awaited<ReturnType<NginxProxyRouteServiceDb['list']>>[number]

const createStubDb = (calls: string[]) => {
    const rows: NginxRouteRow[] = []

    const db: NginxProxyRouteServiceDb = {
        list: async () => [...rows],
        findCollision: async (hostname, path, pathMode) =>
            rows.find((row) => row.hostname === hostname && row.path === path && row.pathMode === pathMode),
        insert: async (record) => {
            calls.push('insert')
            rows.push(record)
        },
        update: async (id, record) => {
            calls.push('update')
            const index = rows.findIndex((row) => row.id === id)
            const current = rows[index]
            if (current) {
                rows[index] = { ...current, ...record }
            }
        },
        delete: async (id) => {
            calls.push('delete')
            const index = rows.findIndex((row) => row.id === id)
            if (index >= 0) {
                rows.splice(index, 1)
            }
        },
    }

    return { db, rows }
}

const createStubEngine = (calls: string[], failure: { apply: boolean }) => {
    let config = BASE_CONFIG
    let sha256 = INITIAL_SHA256

    return {
        client: {
            getNginxConfig: async () => ({ config, history: [], sha256 }),
            applyNginxConfig: async (input: unknown) => {
                calls.push('apply')
                if (failure.apply) {
                    throw new Error('apply failed')
                }
                const parsed = nginxConfigApplySchema.parse(input)
                config = parsed.config
                sha256 = APPLIED_SHA256
                return { appliedAt: NOW.toISOString(), previousSha256: parsed.expectedSha256, sha256, validationOutput: '' }
            },
        },
        resetConfig: () => {
            config = BASE_CONFIG
            sha256 = INITIAL_SHA256
        },
    }
}

const createHarness = () => {
    const calls: string[] = []
    const failure = { apply: false }
    const { db, rows } = createStubDb(calls)
    const engine = createStubEngine(calls, failure)
    const service = createNginxProxyRouteService({
        db,
        engineAgentClient: engine.client,
        now: () => NOW,
        protectedContainers: ['containers-api'],
        protectedHostnames: () => ['panel.example.com'],
    })

    return { calls, engine, failure, rows, service }
}

const input = (values: Record<string, unknown> = {}) => ({
    hostname: 'app.example.com',
    path: '/',
    targetContainer: 'example-app',
    targetPort: 3000,
    ...values,
})

describe('Nginx proxy route service 지속성 순서', () => {
    test('성공 경로는 DB 커밋 후 nginx를 적용합니다', async () => {
        const { calls, rows, service } = createHarness()

        const result = await service.create(input())

        expect(calls).toEqual(['insert', 'apply'])
        expect(result.configSha256).toBe(APPLIED_SHA256)
        expect(rows).toHaveLength(1)
    })

    test('생성 적용이 실패하면 DB 행을 되돌립니다', async () => {
        const { failure, rows, service } = createHarness()
        failure.apply = true

        await expect(service.create(input())).rejects.toThrow('apply failed')
        expect(rows).toHaveLength(0)
    })

    test('수정 적용이 실패하면 이전 값을 복원합니다', async () => {
        const { failure, rows, service } = createHarness()
        await service.create(input())
        failure.apply = true

        await expect(service.upsert(input({ targetPort: 9000 }))).rejects.toThrow('apply failed')
        expect(rows).toHaveLength(1)
        expect(rows[0]?.targetPort).toBe(3000)
    })

    test('삭제 적용이 실패하면 행을 재삽입합니다', async () => {
        const { failure, rows, service } = createHarness()
        const created = await service.create(input())
        failure.apply = true

        await expect(service.remove(created.route.id, 'app.example.com/')).rejects.toThrow('apply failed')
        expect(rows).toHaveLength(1)
        expect(rows[0]?.id).toBe(created.route.id)
    })

    test('보상까지 실패하면 실패 사실을 detail에 담아 던집니다', async () => {
        const calls: string[] = []
        const failure = { apply: true }
        const { db } = createStubDb(calls)
        const engine = createStubEngine(calls, failure)
        const service = createNginxProxyRouteService({
            db: {
                ...db,
                delete: async () => {
                    throw new Error('rollback failed')
                },
            },
            engineAgentClient: engine.client,
            now: () => NOW,
            protectedContainers: [],
            protectedHostnames: () => [],
        })

        const error = await service.create(input()).then(
            () => undefined,
            (reason: unknown) => reason,
        )

        expect(isAppError(error)).toBe(true)
        expect(isAppError(error) ? error.details : undefined).toMatchObject({
            applyFailure: 'apply failed',
            compensationFailure: 'rollback failed',
            compensationSucceeded: false,
        })
    })

    test('동시 생성 요청을 직렬로 처리합니다', async () => {
        const { calls, rows, service } = createHarness()

        await Promise.all([service.create(input()), service.create(input({ hostname: 'api.example.com' }))])

        expect(calls).toEqual(['insert', 'apply', 'insert', 'apply'])
        expect(rows).toHaveLength(2)
    })
})

describe('Nginx proxy route service reconcile', () => {
    test('config가 이미 일치하면 적용하지 않습니다', async () => {
        const { calls, service } = createHarness()
        await service.create(input())
        calls.length = 0

        expect(await service.reconcileRoutes()).toEqual({ applied: false, configSha256: APPLIED_SHA256 })
        expect(calls).toEqual([])
    })

    test('live config가 어긋나면 재적용합니다', async () => {
        const { calls, engine, service } = createHarness()
        await service.create(input())
        engine.resetConfig()
        calls.length = 0

        expect(await service.reconcileRoutes()).toEqual({ applied: true, configSha256: APPLIED_SHA256 })
        expect(calls).toEqual(['apply'])
    })
})
