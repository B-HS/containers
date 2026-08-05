import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { API_KEY_SCOPE, type ApiKeyScope } from '@containers/contracts/api-key'
import { createAppError } from '../../lib/error'
import { createEngineRoute } from './create-engine-route'

const BASE_TIME = new Date('2026-08-01T00:00:00.000Z')
const CONTAINER_ID = 'container-1'

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

const ENGINE_OVERVIEW = {
    apiVersion: '1.45',
    architecture: 'x86_64',
    containers: { paused: 0, running: 1, stopped: 0, total: 1 },
    cpus: 2,
    disk: {
        availableBytes: 1,
        buildCacheBytes: 0,
        capacityBytes: 2,
        containerWritableBytes: 0,
        estimatedReclaimableBytes: 0,
        layersBytes: 0,
        localVolumeBytes: 0,
        usedBytes: 1,
    },
    engineId: 'engine-id',
    engineName: 'engine',
    images: 1,
    memoryBytes: 1_024,
    minApiVersion: '1.24',
    operatingSystem: 'linux',
    os: 'linux',
    version: '27.0.0',
}

const CONTAINER_SUMMARY = {
    command: 'run',
    createdAt: BASE_TIME.toISOString(),
    id: CONTAINER_ID,
    image: 'example:1.0.0',
    imageId: 'image-id',
    labelKeys: [],
    exposedPorts: ['8080/tcp'],
    networks: ['containers_edge'],
    names: ['/example'],
    state: 'running',
    status: 'Up 1 minute',
}

const CONTAINER_DETAIL = {
    args: [],
    command: ['run'],
    createdAt: BASE_TIME.toISOString(),
    entrypoint: [],
    environmentKeys: [],
    exposedPorts: [],
    hostname: 'example',
    id: CONTAINER_ID,
    image: 'example:1.0.0',
    labelKeys: [],
    mounts: [],
    name: '/example',
    networks: [],
    platform: 'linux',
    restartCount: 0,
    state: {
        error: '',
        exitCode: 0,
        finishedAt: '',
        health: null,
        paused: false,
        pid: 1,
        restarting: false,
        running: true,
        startedAt: BASE_TIME.toISOString(),
        status: 'running',
    },
    user: '',
    workingDirectory: '/',
}

const createTestApp = () =>
    new Hono().route(
        '/api',
        createEngineRoute({
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
            engineService: {
                getContainer: async () => CONTAINER_DETAIL,
                getContainerLogs: async () => ({ stderr: '', stdout: 'log', truncated: false }),
                getContainers: async () => [CONTAINER_SUMMARY],
                getOverview: async () => ENGINE_OVERVIEW,
            },
        }),
    )

const PATHS = ['/api/system/engine', '/api/containers', `/api/containers/${CONTAINER_ID}`, `/api/containers/${CONTAINER_ID}/logs?tail=10`]

const statuses = async (headers: Record<string, string> = {}) =>
    Promise.all(PATHS.map(async (path) => (await createTestApp().request(path, { headers })).status))

describe('엔진 라우트 인증', () => {
    test('engine:read scope API key 는 200 입니다', async () => {
        expect(await statuses({ authorization: 'Bearer engine-key' })).toEqual([200, 200, 200, 200])
    })

    test('scope 가 없는 API key 는 403 입니다', async () => {
        expect(await statuses({ authorization: 'Bearer wrong-key' })).toEqual([403, 403, 403, 403])
    })

    test('세션 요청은 그대로 200 입니다', async () => {
        expect(await statuses({ cookie: 'session=1' })).toEqual([200, 200, 200, 200])
    })

    test('미인증 요청은 401 입니다', async () => {
        expect(await statuses()).toEqual([401, 401, 401, 401])
    })
})
