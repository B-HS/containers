import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { LOGIN_LOCKOUT_POLICY } from '@containers/config/login-lockout'
import { createControlDatabase } from '@containers/db-schema/database'
import { buildLoginLockoutServiceDb } from '../../../compose/compose-auth'
import { createLoginLockoutService } from './create-login-lockout-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-login-lockout-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    let current = new Date('2026-08-06T00:00:00.000Z')
    const service = createLoginLockoutService({ db: buildLoginLockoutServiceDb(database.db), now: () => current })
    return { ...database, advance: (milliseconds: number) => (current = new Date(current.getTime() + milliseconds)), service }
}

const failTimes = async (service: Awaited<ReturnType<typeof createTestContext>>['service'], email: string, times: number) => {
    for (let attempt = 0; attempt < times; attempt += 1) {
        await service.recordFailure(email)
    }
}

describe('로그인 잠금 서비스', () => {
    test('허용 횟수까지는 잠그지 않는다', async () => {
        const { service, sqlite } = await createTestContext()
        await failTimes(service, 'owner@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts)

        expect(await service.assertNotLocked('owner@example.com')).toBeUndefined()
        sqlite.close()
    })

    test('허용 횟수를 넘기면 잠그고 대기 시간을 알려준다', async () => {
        const { service, sqlite } = await createTestContext()
        await failTimes(service, 'owner@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts + 1)

        await expect(service.assertNotLocked('owner@example.com')).rejects.toThrow('AUTH_LOCKED')
        sqlite.close()
    })

    test('대문자와 공백이 달라도 같은 계정으로 센다', async () => {
        const { service, sqlite } = await createTestContext()
        await failTimes(service, ' Owner@Example.com ', LOGIN_LOCKOUT_POLICY.freeAttempts + 1)

        await expect(service.assertNotLocked('owner@example.com')).rejects.toThrow('AUTH_LOCKED')
        sqlite.close()
    })

    test('잠금 시간이 지나면 다시 시도할 수 있다', async () => {
        const { advance, service, sqlite } = await createTestContext()
        await failTimes(service, 'owner@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts + 1)
        advance(LOGIN_LOCKOUT_POLICY.firstLockMs)

        expect(await service.assertNotLocked('owner@example.com')).toBeUndefined()
        sqlite.close()
    })

    test('성공하면 연속 실패를 지운다', async () => {
        const { service, sqlite } = await createTestContext()
        await failTimes(service, 'owner@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts)
        await service.clear('owner@example.com')
        const next = await service.recordFailure('owner@example.com')

        expect(next.failedCount).toBe(1)
        expect(next.lockedUntil).toBeNull()
        sqlite.close()
    })

    test('실패 창을 벗어나면 처음부터 다시 센다', async () => {
        const { advance, service, sqlite } = await createTestContext()
        await failTimes(service, 'owner@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts)
        advance(LOGIN_LOCKOUT_POLICY.failureWindowMs)
        const next = await service.recordFailure('owner@example.com')

        expect(next.failedCount).toBe(1)
        expect(next.lockedUntil).toBeNull()
        sqlite.close()
    })

    test('존재하지 않는 주소도 똑같이 세어 계정 유무를 드러내지 않는다', async () => {
        const { service, sqlite } = await createTestContext()
        await failTimes(service, 'nobody@example.com', LOGIN_LOCKOUT_POLICY.freeAttempts + 1)

        await expect(service.assertNotLocked('nobody@example.com')).rejects.toThrow('AUTH_LOCKED')
        sqlite.close()
    })
})
