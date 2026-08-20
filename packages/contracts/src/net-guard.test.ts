import { describe, expect, test } from 'bun:test'
import { findRegistryHostViolation, getRegistryHost, isIpLiteral, isPrivateAddress } from './net-guard'

describe('isPrivateAddress', () => {
    test('공인 IPv4 는 통과한다', () => {
        expect(isPrivateAddress('93.184.216.34')).toBe(false)
        expect(isPrivateAddress('1.1.1.1')).toBe(false)
    })

    test('사설·루프백·링크로컬·CGN IPv4 는 차단한다', () => {
        for (const address of ['10.0.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
            expect(isPrivateAddress(address)).toBe(true)
        }
    })

    test('IPv6 루프백·ULA·링크로컬은 차단하고 공인 IPv6 는 통과한다', () => {
        expect(isPrivateAddress('::1')).toBe(true)
        expect(isPrivateAddress('fd00::1')).toBe(true)
        expect(isPrivateAddress('fe80::1')).toBe(true)
        expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
    })

    test('IPv4-mapped IPv6 는 내장된 IPv4 기준으로 판정한다', () => {
        expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true)
        expect(isPrivateAddress('::ffff:93.184.216.34')).toBe(false)
    })

    test('해석 불가능한 값은 차단한다', () => {
        expect(isPrivateAddress('not-an-address')).toBe(true)
        expect(isPrivateAddress('')).toBe(true)
    })
})

describe('getRegistryHost', () => {
    test('Docker Hub 단축 참조는 undefined 를 반환한다', () => {
        expect(getRegistryHost('mysql:9')).toBeUndefined()
        expect(getRegistryHost('library/mysql:9')).toBeUndefined()
        expect(getRegistryHost('sha256:abc')).toBeUndefined()
    })

    test('레지스트리 호스트가 붙은 참조에서 호스트를 추출한다', () => {
        expect(getRegistryHost('codeberg.org/forgejo/forgejo:16')).toBe('codeberg.org')
        expect(getRegistryHost('registry.example.com:5000/team/image:1')).toBe('registry.example.com')
        expect(getRegistryHost('localhost:5000/image')).toBe('localhost')
        expect(getRegistryHost('myregistry:5000/image')).toBe('myregistry')
        expect(getRegistryHost('[::1]:5000/image')).toBe('::1')
    })
})

describe('findRegistryHostViolation', () => {
    test('공개 호스트는 통과한다', () => {
        expect(findRegistryHostViolation('codeberg.org')).toBeNull()
        expect(findRegistryHostViolation('ghcr.io')).toBeNull()
        expect(findRegistryHostViolation('93.184.216.34')).toBeNull()
    })

    test('localhost 와 내부 suffix 는 거부한다', () => {
        expect(findRegistryHostViolation('localhost')).toBe('localhost')
        expect(findRegistryHostViolation('registry.local')).toBe('internal-suffix')
        expect(findRegistryHostViolation('registry.internal')).toBe('internal-suffix')
    })

    test('사설 IP 리터럴과 단일 라벨 호스트는 거부한다', () => {
        expect(findRegistryHostViolation('192.168.0.10')).toBe('private-ip')
        expect(findRegistryHostViolation('::1')).toBe('private-ip')
        expect(findRegistryHostViolation('myregistry')).toBe('single-label')
    })
})

describe('isIpLiteral', () => {
    test('IPv4·IPv6 리터럴을 판별한다', () => {
        expect(isIpLiteral('93.184.216.34')).toBe(true)
        expect(isIpLiteral('2606:4700::1111')).toBe(true)
        expect(isIpLiteral('codeberg.org')).toBe(false)
    })
})
