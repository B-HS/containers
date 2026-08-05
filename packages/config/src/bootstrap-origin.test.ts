import { describe, expect, test } from 'bun:test'
import { isInternalBootstrapHost } from './bootstrap-origin'

const withHost = (host: string) => new Headers({ host })

describe('isInternalBootstrapHost', () => {
    test('loopback 과 내부 이름에서는 허용합니다', () => {
        for (const host of ['127.0.0.1:18080', 'localhost:18080', 'LOCALHOST', '[::1]:18080', 'panel.containers.local']) {
            expect(isInternalBootstrapHost(withHost(host))).toBe(true)
        }
    })

    test('공개 도메인에서는 거부합니다', () => {
        for (const host of ['panel.example.com', 'panel.example.com:443', 'localhost.example.com']) {
            expect(isInternalBootstrapHost(withHost(host))).toBe(false)
        }
    })

    test('Host 가 없으면 거부합니다', () => {
        expect(isInternalBootstrapHost(new Headers())).toBe(false)
    })
})
