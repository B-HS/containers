import { describe, expect, test } from 'bun:test'
import { applyTrustedProxies, readTrustedProxies } from './trusted-proxy'

const CONFIG = `events {}
http {
    access_log /var/log/nginx/access.jsonl containers_json;

    set_real_ip_from 10.89.0.10/32;
    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;

    server {
        listen 8080;
        server_name panel.containers.local;
    }
}
`

describe('applyTrustedProxies', () => {
    test('현재 신뢰 목록을 읽는다', () => {
        expect(readTrustedProxies(CONFIG)).toEqual(['10.89.0.10/32'])
    })

    test('목록을 통째로 교체한다', () => {
        const next = applyTrustedProxies(CONFIG, ['203.0.113.7/32'])

        expect(readTrustedProxies(next ?? '')).toEqual(['203.0.113.7/32'])
        expect(next).toContain('real_ip_header CF-Connecting-IP;')
        expect(next).toContain('server_name panel.containers.local;')
    })

    test('여러 주소를 각각의 지시어로 적는다', () => {
        const next = applyTrustedProxies(CONFIG, ['203.0.113.7/32', '198.51.100.9/32'])

        expect(readTrustedProxies(next ?? '')).toEqual(['203.0.113.7/32', '198.51.100.9/32'])
        expect((next ?? '').match(/set_real_ip_from/g)).toHaveLength(2)
    })

    test('여러 개에서 하나로 줄이면 남은 지시어를 지운다', () => {
        const expanded = applyTrustedProxies(CONFIG, ['203.0.113.7/32', '198.51.100.9/32']) ?? ''
        const reduced = applyTrustedProxies(expanded, ['203.0.113.7/32'])

        expect(readTrustedProxies(reduced ?? '')).toEqual(['203.0.113.7/32'])
        expect((reduced ?? '').match(/set_real_ip_from/g)).toHaveLength(1)
    })

    test('같은 목록이면 null 을 돌려준다', () => {
        expect(applyTrustedProxies(CONFIG, ['10.89.0.10/32'])).toBeNull()
        expect(applyTrustedProxies(CONFIG, ['10.89.0.10/32', '10.89.0.10/32'])).toBeNull()
    })

    test('빈 목록으로는 비우지 않는다', () => {
        expect(applyTrustedProxies(CONFIG, [])).toBeNull()
        expect(applyTrustedProxies(CONFIG, ['  '])).toBeNull()
    })

    test('지시어가 없으면 null 을 돌려준다', () => {
        expect(applyTrustedProxies('events {} http { }', ['203.0.113.7/32'])).toBeNull()
        expect(readTrustedProxies('events {} http { }')).toEqual([])
    })

    test('들여쓰기를 보존한다', () => {
        const next = applyTrustedProxies(CONFIG, ['203.0.113.7/32']) ?? ''

        expect(next).toContain('\n    set_real_ip_from 203.0.113.7/32;')
        expect(next.split('\n')).toHaveLength(CONFIG.split('\n').length)
    })
})
