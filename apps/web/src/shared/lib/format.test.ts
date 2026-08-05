import { describe, expect, test } from 'bun:test'
import { formatBytes } from './format-bytes'
import { formatDateTime } from './format-date-time'
import { parseApiError } from './parse-api-error'

const KIB = 1_024
const MIB = 1_048_576

describe('formatBytes', () => {
    test('1 KiB 미만은 바이트 그대로 보여준다', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(KIB - 1)).toBe('1023 B')
    })

    test('경계값에서 단위가 바뀐다', () => {
        expect(formatBytes(KIB)).toBe('1.0 KiB')
        expect(formatBytes(MIB - 1)).toBe('1024.0 KiB')
        expect(formatBytes(MIB)).toBe('1.0 MiB')
    })
})

describe('formatDateTime', () => {
    test('null 은 null 로 통과시킨다', () => {
        expect(formatDateTime(null)).toBeNull()
    })

    test('UTC ISO 를 밀리초 없이 보여준다', () => {
        expect(formatDateTime('2026-08-05T03:16:34.123Z')).toBe('2026-08-05 03:16:34Z')
    })

    test('오프셋이 붙은 값도 UTC 로 정규화한다', () => {
        expect(formatDateTime('2026-08-05T12:16:34+09:00')).toBe('2026-08-05 03:16:34Z')
    })
})

describe('parseApiError', () => {
    test('API 에러 봉투에서 메시지를 꺼낸다', () => {
        expect(parseApiError({ error: { code: 'FORBIDDEN', message: '권한이 없습니다.' }, success: false }, '실패')).toBe('권한이 없습니다.')
    })

    test('평평한 message 형태도 읽는다', () => {
        expect(parseApiError({ message: '중복된 요청입니다.' }, '실패')).toBe('중복된 요청입니다.')
    })

    test('형태가 다르면 fallback 을 쓴다', () => {
        expect(parseApiError({ error: 'boom' }, '실패')).toBe('실패')
        expect(parseApiError(null, '실패')).toBe('실패')
        expect(parseApiError('boom', '실패')).toBe('실패')
    })
})
