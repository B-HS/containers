import { describe, expect, test } from 'bun:test'
import { parseOriginList, resolveTrustedOrigins, toOrigin } from './origin'

describe('origin 목록 파싱', () => {
    test('쉼표로 구분된 값을 공백 제거해 반환합니다', () => {
        expect(parseOriginList('http://127.0.0.1:8080, http://localhost:8080')).toEqual(['http://127.0.0.1:8080', 'http://localhost:8080'])
    })

    test('빈 항목을 제거합니다', () => {
        expect(parseOriginList('http://127.0.0.1:8080,,  ,')).toEqual(['http://127.0.0.1:8080'])
    })
})

describe('origin 정규화', () => {
    test('절대 URL 의 origin 을 반환합니다', () => {
        expect(toOrigin('https://panel.example.com/login?next=/ko')).toBe('https://panel.example.com')
    })

    test('파싱할 수 없는 값은 null 을 반환합니다', () => {
        expect(toOrigin('*.example.com')).toBeNull()
    })
})

describe('신뢰 origin 병합', () => {
    test('baseUrl 의 origin 이 목록에 없으면 추가합니다', () => {
        expect(resolveTrustedOrigins({ baseUrl: 'http://192.168.0.10:9000', origins: ['http://127.0.0.1:8080'] })).toEqual([
            'http://127.0.0.1:8080',
            'http://192.168.0.10:9000',
        ])
    })

    test('이미 포함된 origin 을 중복 추가하지 않습니다', () => {
        expect(resolveTrustedOrigins({ baseUrl: 'http://127.0.0.1:8080', origins: ['http://127.0.0.1:8080', 'http://localhost:8080'] })).toEqual([
            'http://127.0.0.1:8080',
            'http://localhost:8080',
        ])
    })

    test('경로·후행 슬래시가 붙은 항목을 origin 으로 정규화합니다', () => {
        expect(resolveTrustedOrigins({ baseUrl: 'https://panel.example.com', origins: ['https://panel.example.com/'] })).toEqual([
            'https://panel.example.com',
        ])
    })

    test('와일드카드 패턴은 그대로 유지합니다', () => {
        expect(resolveTrustedOrigins({ baseUrl: 'https://panel.example.com', origins: ['*.example.com'] })).toEqual([
            '*.example.com',
            'https://panel.example.com',
        ])
    })

    test('baseUrl 을 파싱할 수 없으면 원래 목록을 유지합니다', () => {
        expect(resolveTrustedOrigins({ baseUrl: 'not-a-url', origins: ['http://127.0.0.1:8080'] })).toEqual(['http://127.0.0.1:8080'])
    })
})
