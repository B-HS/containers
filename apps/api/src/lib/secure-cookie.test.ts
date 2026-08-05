import { describe, expect, test } from 'bun:test'
import { applySecureCookies, isForwardedHttps } from './secure-cookie'

const headersWithCookies = (cookies: string[]) => {
    const headers = new Headers()
    for (const cookie of cookies) headers.append('set-cookie', cookie)
    return headers
}

describe('isForwardedHttps', () => {
    test('앞단 프록시가 https 를 알리면 true 입니다', () => {
        expect(isForwardedHttps(new Headers({ 'x-forwarded-proto': 'https' }))).toBe(true)
        expect(isForwardedHttps(new Headers({ 'x-forwarded-proto': 'HTTPS' }))).toBe(true)
    })

    test('http 이거나 헤더가 없으면 false 입니다', () => {
        expect(isForwardedHttps(new Headers({ 'x-forwarded-proto': 'http' }))).toBe(false)
        expect(isForwardedHttps(new Headers())).toBe(false)
    })
})

describe('applySecureCookies', () => {
    test('Secure 가 없는 쿠키에 붙입니다', () => {
        const headers = headersWithCookies(['better-auth.session_token=abc; Path=/; HttpOnly; SameSite=Lax'])

        applySecureCookies(headers)

        expect(headers.getSetCookie()).toEqual(['better-auth.session_token=abc; Path=/; HttpOnly; SameSite=Lax; Secure'])
    })

    test('쿠키 이름은 바꾸지 않아 기존 세션이 유지됩니다', () => {
        const headers = headersWithCookies(['better-auth.session_token=abc; Path=/'])

        applySecureCookies(headers)

        expect(headers.getSetCookie()[0]?.startsWith('better-auth.session_token=abc')).toBe(true)
    })

    test('이미 Secure 인 쿠키는 그대로 둡니다', () => {
        const original = ['a=1; Path=/; Secure', 'b=2; Path=/; secure']
        const headers = headersWithCookies(original)

        applySecureCookies(headers)

        expect(headers.getSetCookie()).toEqual(original)
    })

    test('여러 쿠키를 각각 처리합니다', () => {
        const headers = headersWithCookies(['a=1; Path=/', 'b=2; Path=/; Secure', 'c=3; Path=/; HttpOnly'])

        applySecureCookies(headers)

        expect(headers.getSetCookie()).toEqual(['a=1; Path=/; Secure', 'b=2; Path=/; Secure', 'c=3; Path=/; HttpOnly; Secure'])
    })

    test('쿠키 값에 secure 라는 문자열이 있어도 속성으로 오인하지 않습니다', () => {
        const headers = headersWithCookies(['token=secure; Path=/'])

        applySecureCookies(headers)

        expect(headers.getSetCookie()).toEqual(['token=secure; Path=/; Secure'])
    })

    test('설정하는 쿠키가 없으면 아무것도 하지 않습니다', () => {
        const headers = new Headers({ 'content-type': 'application/json' })

        applySecureCookies(headers)

        expect(headers.getSetCookie()).toEqual([])
    })
})
