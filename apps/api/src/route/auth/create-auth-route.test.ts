import { describe, expect, test } from 'bun:test'
import { createAuthRoute } from './create-auth-route'
import { createAppError } from '../../lib/error'

const BETTER_AUTH_USER_ID = '0ZMUeMrrT53V6iFTgYVOn8BhpylXpqfG'
const SEEDED_USER_ID = '289ada3c-20e9-44a6-9fe8-332aac036f39'

const createTestRoute = () => {
    const deleted: string[] = []
    const updated: string[] = []
    const route = createAuthRoute({
        auditService: { record: async () => undefined },
        authService: {
            acceptInvitation: async () => {
                throw createAppError('AUTH_REQUIRED')
            },
            bootstrapOwner: async () => {
                throw createAppError('AUTH_REQUIRED')
            },
            createInvitation: async () => {
                throw createAppError('AUTH_REQUIRED')
            },
            deleteUser: async (_headers, targetUserId) => {
                deleted.push(targetUserId)
                return { email: 'target@example.com', id: targetUserId, role: 'admin' }
            },
            getBootstrapStatus: async () => ({ required: false }),
            getSession: async () => ({ role: 'owner', user: { id: 'actor' } }) as never,
            getSessionSummary: async () => undefined,
            listUsers: async () => [],
            updateUser: async (_headers, targetUserId) => {
                updated.push(targetUserId)
                return {
                    createdAt: '2026-08-05T00:00:00.000Z',
                    disabledAt: null,
                    email: 'target@example.com',
                    id: targetUserId,
                    name: 'Target',
                    role: 'admin' as const,
                    updatedAt: '2026-08-05T00:00:00.000Z',
                }
            },
        },
    })

    return { deleted, route, updated }
}

const requestDelete = (route: ReturnType<typeof createTestRoute>['route'], id: string) =>
    route.request(`/users/${id}`, { headers: { origin: 'http://127.0.0.1:18080' }, method: 'DELETE' })

describe('사용자 라우트', () => {
    test('better-auth 가 만든 비-UUID id 도 삭제할 수 있다', async () => {
        const { deleted, route } = createTestRoute()

        const response = await requestDelete(route, BETTER_AUTH_USER_ID)

        expect(response.status).toBe(200)
        expect(deleted).toEqual([BETTER_AUTH_USER_ID])
    })

    test('seed 가 만든 UUID id 도 삭제할 수 있다', async () => {
        const { deleted, route } = createTestRoute()

        const response = await requestDelete(route, SEEDED_USER_ID)

        expect(response.status).toBe(200)
        expect(deleted).toEqual([SEEDED_USER_ID])
    })

    test('id 가 비면 거부한다', async () => {
        const { deleted, route } = createTestRoute()

        const response = await requestDelete(route, '%20')

        expect(response.status).toBe(400)
        expect(deleted).toEqual([])
    })

    test('변경도 같은 id 규칙을 쓴다', async () => {
        const { route, updated } = createTestRoute()

        const response = await route.request(`/users/${BETTER_AUTH_USER_ID}`, {
            body: JSON.stringify({ disabled: true }),
            headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:18080' },
            method: 'PATCH',
        })

        expect(response.status).toBe(200)
        expect(updated).toEqual([BETTER_AUTH_USER_ID])
    })
})
