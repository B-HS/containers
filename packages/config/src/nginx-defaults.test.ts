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
})
