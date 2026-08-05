import { describe, expect, test } from 'bun:test'
import { redactSecretLines, redactSecretText } from './redact-log'

describe('redactSecretText', () => {
    test('민감한 key 의 값을 가립니다', () => {
        expect(redactSecretText('DATABASE_PASSWORD=hunter2')).toBe('DATABASE_PASSWORD=[REDACTED]')
        expect(redactSecretText('api_key: abcdef0123')).toBe('api_key: [REDACTED]')
        expect(redactSecretText('"accessToken":"abcdef"')).toBe('"accessToken":[REDACTED]')
    })

    test('Authorization scheme 과 JWT 를 가립니다', () => {
        expect(redactSecretText('curl -H "Authorization: Bearer abcdef012345"')).toContain('[REDACTED]')
        expect(redactSecretText('token eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM')).toBe('token [REDACTED]')
    })

    test('URL 자격증명을 가립니다', () => {
        expect(redactSecretText('postgres://app:hunter2@db:5432/app')).toBe('postgres://app:[REDACTED]@db:5432/app')
    })

    test('평범한 실패 로그는 그대로 둡니다', () => {
        const line = 'nginx: [emerg] mkdir("/var/cache/nginx/client_temp") failed (30: Read-only file system)'
        expect(redactSecretText(line)).toBe(line)
    })

    test('지나치게 긴 줄은 잘라냅니다', () => {
        const redacted = redactSecretText('a'.repeat(1_000))
        expect(redacted.length).toBe(513)
        expect(redacted.endsWith('…')).toBe(true)
    })
})

describe('redactSecretLines', () => {
    test('빈 줄을 버리고 마지막 limit 줄만 남깁니다', () => {
        expect(redactSecretLines('one\n\ntwo\r\nthree\n', 2)).toEqual(['two', 'three'])
    })

    test('남은 줄에도 리댁션을 적용합니다', () => {
        expect(redactSecretLines('SECRET_TOKEN=abc\nstarting\n', 2)).toEqual(['SECRET_TOKEN=[REDACTED]', 'starting'])
    })

    test('빈 입력은 빈 배열입니다', () => {
        expect(redactSecretLines('', 5)).toEqual([])
    })
})
