import { describe, expect, test } from 'bun:test'
import { isWithinFailureWindow, lockDurationMs, LOGIN_LOCKOUT_POLICY, toLoginLockoutKey } from './login-lockout'

describe('로그인 잠금 정책', () => {
    test('주소를 소문자로 정규화하고 사용할 수 없는 값은 버린다', () => {
        expect(toLoginLockoutKey('  Owner@Example.COM ')).toBe('owner@example.com')
        expect(toLoginLockoutKey('')).toBeNull()
        expect(toLoginLockoutKey('   ')).toBeNull()
        expect(toLoginLockoutKey(undefined)).toBeNull()
        expect(toLoginLockoutKey(42)).toBeNull()
    })

    test('허용 횟수까지는 잠그지 않는다', () => {
        for (let attempt = 0; attempt <= LOGIN_LOCKOUT_POLICY.freeAttempts; attempt += 1) {
            expect(lockDurationMs(attempt)).toBe(0)
        }
    })

    test('허용 횟수를 넘기면 대기 시간이 두 배씩 늘고 상한에서 멈춘다', () => {
        expect(lockDurationMs(LOGIN_LOCKOUT_POLICY.freeAttempts + 1)).toBe(LOGIN_LOCKOUT_POLICY.firstLockMs)
        expect(lockDurationMs(LOGIN_LOCKOUT_POLICY.freeAttempts + 2)).toBe(LOGIN_LOCKOUT_POLICY.firstLockMs * 2)
        expect(lockDurationMs(LOGIN_LOCKOUT_POLICY.freeAttempts + 3)).toBe(LOGIN_LOCKOUT_POLICY.firstLockMs * 4)
        expect(lockDurationMs(LOGIN_LOCKOUT_POLICY.freeAttempts + 20)).toBe(LOGIN_LOCKOUT_POLICY.maxLockMs)
    })

    test('창을 벗어난 실패는 같은 연속으로 보지 않는다', () => {
        const firstFailedAt = new Date('2026-08-06T00:00:00.000Z')
        expect(isWithinFailureWindow(firstFailedAt, new Date(firstFailedAt.getTime() + LOGIN_LOCKOUT_POLICY.failureWindowMs - 1))).toBe(true)
        expect(isWithinFailureWindow(firstFailedAt, new Date(firstFailedAt.getTime() + LOGIN_LOCKOUT_POLICY.failureWindowMs))).toBe(false)
    })
})
