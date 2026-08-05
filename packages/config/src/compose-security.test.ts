import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findComposeSecurityViolations, type ComposeFile } from './compose-security'

const REPOSITORY_ROOT = join(import.meta.dir, '../../..')
const compose = Bun.YAML.parse(readFileSync(join(REPOSITORY_ROOT, 'compose.yaml'), 'utf8')) as ComposeFile

describe('compose 보안 불변식', () => {
    test('배포되는 compose.yaml 에 위반이 없다', () => {
        expect(findComposeSecurityViolations(compose)).toEqual([])
    })

    test('서비스 정의를 실제로 읽고 있다', () => {
        expect(Object.keys(compose.services ?? {}).length).toBeGreaterThan(4)
    })

    test('privileged 를 켜면 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { ...compose.services?.api, privileged: true } } })

        expect(violations.some((violation) => violation.rule === 'no-privileged')).toBe(true)
    })

    test('호스트 네임스페이스 공유를 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { ...compose.services?.api, network_mode: 'host', pid: 'host' } } })

        expect(violations.filter((violation) => violation.rule === 'no-host-namespace')).toHaveLength(2)
    })

    test('engine-agent 외 서비스의 docker socket 마운트를 잡는다', () => {
        const violations = findComposeSecurityViolations({
            services: { api: { ...compose.services?.api, volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro'] } },
        })

        expect(violations.some((violation) => violation.rule === 'docker-socket-scope')).toBe(true)
    })

    test('loopback 이 아닌 publish 를 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { nginx: { ...compose.services?.nginx, ports: ['0.0.0.0:8080:8080'] } } })

        expect(violations.some((violation) => violation.rule === 'loopback-publish-only')).toBe(true)
    })

    test('nginx 외 서비스의 포트 publish 를 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { ...compose.services?.api, ports: ['127.0.0.1:3001:3001'] } } })

        expect(violations.some((violation) => violation.rule === 'publish-scope')).toBe(true)
    })

    test('read_only 해제와 no-new-privileges 누락을 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { read_only: false, security_opt: [] } } })

        expect(violations.map((violation) => violation.rule).sort()).toEqual(['no-new-privileges', 'read-only-rootfs'])
    })

    test('위험한 capability 추가를 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { ...compose.services?.api, cap_add: ['SYS_ADMIN'] } } })

        expect(violations.some((violation) => violation.rule === 'no-dangerous-capability')).toBe(true)
    })

    test('호스트 루트 마운트를 잡는다', () => {
        const violations = findComposeSecurityViolations({ services: { api: { ...compose.services?.api, volumes: ['/:/host'] } } })

        expect(violations.some((violation) => violation.rule === 'no-host-root-mount')).toBe(true)
    })
})
