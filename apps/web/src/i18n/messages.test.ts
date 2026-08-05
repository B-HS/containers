import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routing } from './routing'

const REFERENCE_LOCALE = routing.defaultLocale
const ICU_PARAMETER_PATTERN = /\{\s*([A-Za-z0-9_]+)/g

const readCatalog = (locale: string) => JSON.parse(readFileSync(join(import.meta.dir, `../../messages/${locale}.json`), 'utf8')) as unknown

const flatten = (value: unknown, prefix = ''): Record<string, string> => {
    if (typeof value === 'string') return { [prefix]: value }
    if (value === null || typeof value !== 'object') return {}
    return Object.entries(value).reduce<Record<string, string>>(
        (flattened, [key, child]) => ({ ...flattened, ...flatten(child, prefix.length === 0 ? key : `${prefix}.${key}`) }),
        {},
    )
}

const parametersOf = (message: string) => [...message.matchAll(ICU_PARAMETER_PATTERN)].map((match) => match[1] ?? '').sort()

const catalogs = routing.locales.map((locale) => ({ locale, messages: flatten(readCatalog(locale)) }))
const reference = catalogs.find((catalog) => catalog.locale === REFERENCE_LOCALE)?.messages ?? {}
const referenceKeys = Object.keys(reference)

describe('로케일 카탈로그', () => {
    test('기준 로케일이 존재한다', () => {
        expect(referenceKeys.length).toBeGreaterThan(0)
    })

    test('모든 로케일이 같은 키 집합을 가진다', () => {
        for (const catalog of catalogs) {
            const keys = Object.keys(catalog.messages)
            expect({
                locale: catalog.locale,
                missing: referenceKeys.filter((key) => !(key in catalog.messages)),
                unexpected: keys.filter((key) => !(key in reference)),
            }).toEqual({ locale: catalog.locale, missing: [], unexpected: [] })
        }
    })

    test('같은 키는 모든 로케일에서 같은 ICU 파라미터를 쓴다', () => {
        for (const catalog of catalogs) {
            const mismatched = referenceKeys.filter((key) => {
                const message = catalog.messages[key]
                return message !== undefined && parametersOf(message).join(',') !== parametersOf(reference[key] ?? '').join(',')
            })
            expect({ locale: catalog.locale, mismatched }).toEqual({ locale: catalog.locale, mismatched: [] })
        }
    })

    test('빈 문자열 메시지가 없다', () => {
        for (const catalog of catalogs) {
            const empty = Object.entries(catalog.messages)
                .filter(([, message]) => message.trim().length === 0)
                .map(([key]) => key)
            expect({ empty, locale: catalog.locale }).toEqual({ empty: [], locale: catalog.locale })
        }
    })
})
