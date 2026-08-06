import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPOSITORY_ROOT = join(import.meta.dir, '../../..')
const CONFIGS = ['infra/nginx/nginx.conf', 'infra/nginx/nginx-tls.conf.example']
const FORWARDED_PROTO_MAP = 'map $http_x_forwarded_proto $containers_forwarded_proto'

const readConfig = (relativePath: string) => readFileSync(join(REPOSITORY_ROOT, relativePath), 'utf8')

describe('nginx 기본 설정', () => {
    test('전달 프로토콜을 앞단 프록시 값에서 유도한다', () => {
        for (const path of CONFIGS) {
            expect(readConfig(path)).toContain(FORWARDED_PROTO_MAP)
        }
    })

    test('업스트림에 $scheme 를 그대로 넘기지 않는다', () => {
        for (const path of CONFIGS) {
            expect(readConfig(path)).not.toContain('X-Forwarded-Proto $scheme')
        }
    })

    test('HSTS 는 하위 도메인까지 적용한다', () => {
        for (const path of CONFIGS) {
            const config = readConfig(path)
            const directives = config.split('\n').filter((line) => line.includes('Strict-Transport-Security'))

            expect(directives.length).toBeGreaterThan(0)
            expect(directives.every((line) => line.includes('includeSubDomains'))).toBe(true)
        }
    })

    test('신뢰 프록시 기본값은 loopback 하나다', () => {
        const directives = readConfig('infra/nginx/nginx.conf')
            .split('\n')
            .filter((line) => line.trim().startsWith('set_real_ip_from'))

        expect(directives.map((line) => line.trim())).toEqual(['set_real_ip_from 127.0.0.1/32;'])
    })

    test('CSP 가 WebAssembly 컴파일을 허용한다', () => {
        for (const path of CONFIGS) {
            const directives = readConfig(path)
                .split('\n')
                .filter((line) => line.includes('Content-Security-Policy') || line.includes('containers_csp "'))

            expect(directives.length).toBeGreaterThan(0)
            expect(directives.some((line) => line.includes("'wasm-unsafe-eval'"))).toBe(true)
        }
    })

    test('패널 CSP 는 인라인 스크립트 대신 요청마다 다른 nonce 를 쓴다', () => {
        const config = readConfig('infra/nginx/nginx.conf')

        expect(config).toContain("script-src 'self' 'nonce-$request_id' 'wasm-unsafe-eval'")
        expect(config).not.toContain("script-src 'self' 'unsafe-inline'")
        expect(config).toContain('proxy_set_header Content-Security-Policy $containers_csp;')
    })

    test('CSP 가 임의 스크립트 eval 은 허용하지 않는다', () => {
        for (const path of CONFIGS) {
            expect(readConfig(path)).not.toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
        }
    })
})
