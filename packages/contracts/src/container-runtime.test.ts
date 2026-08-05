import { describe, expect, test } from 'bun:test'
import { CONTAINER_RUNTIME_PROFILE, FORBIDDEN_CONTAINER_CAPABILITIES, containerRuntimeSchema } from './container-runtime'

describe('컨테이너 런타임 계약', () => {
    test('기본값은 표준 프로필이라 평범한 이미지가 그대로 뜬다', () => {
        const runtime = containerRuntimeSchema.parse({})

        expect(runtime.profile).toBe(CONTAINER_RUNTIME_PROFILE.STANDARD)
        expect(runtime.capabilities).toEqual([])
        expect(runtime.writablePaths).toEqual([])
    })

    test('강화 프로필과 쓰기 경로를 받는다', () => {
        const runtime = containerRuntimeSchema.parse({
            profile: CONTAINER_RUNTIME_PROFILE.HARDENED,
            writablePaths: ['/var/cache/nginx', '/run'],
        })

        expect(runtime.profile).toBe(CONTAINER_RUNTIME_PROFILE.HARDENED)
        expect(runtime.writablePaths).toEqual(['/var/cache/nginx', '/run'])
    })

    test('호스트를 장악할 수 있는 capability 는 거부한다', () => {
        for (const capability of FORBIDDEN_CONTAINER_CAPABILITIES) {
            expect(containerRuntimeSchema.safeParse({ capabilities: [capability] }).success).toBe(false)
        }
    })

    test('CAP_ 접두사를 붙여도 우회할 수 없다', () => {
        expect(containerRuntimeSchema.safeParse({ capabilities: ['CAP_SYS_ADMIN'] }).success).toBe(false)
    })

    test('평범한 capability 는 허용한다', () => {
        const runtime = containerRuntimeSchema.parse({ capabilities: ['NET_BIND_SERVICE', 'CHOWN'] })

        expect(runtime.capabilities).toEqual(['NET_BIND_SERVICE', 'CHOWN'])
    })

    test('상대 경로 쓰기 경로는 거부한다', () => {
        expect(containerRuntimeSchema.safeParse({ writablePaths: ['var/cache'] }).success).toBe(false)
    })
})
