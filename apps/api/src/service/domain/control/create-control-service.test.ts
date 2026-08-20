import { describe, expect, test } from 'bun:test'
import { createControlService } from './create-control-service'
import type { EngineAgentClient } from '../../shared/engine-agent-client/create-engine-agent-client'

const createService = (resolved: { blocked: boolean }, resolvedHostnames: string[] = []) =>
    createControlService({
        egressBrokerClient: {
            resolveHostname: async (hostname: string) => {
                resolvedHostnames.push(hostname)
                return { addresses: resolved.blocked ? [] : ['203.0.113.10'], blocked: resolved.blocked, hostname }
            },
        },
        engineAgentClient: {
            createContainer: async () => ({ operation: 'create-container', targetId: 'container-id' }),
        } as unknown as EngineAgentClient,
    })

describe('controlService.assertPublicImageReference', () => {
    test('Docker Hub 단축 참조는 broker 해석 없이 통과한다', async () => {
        const resolvedHostnames: string[] = []
        await createService({ blocked: false }, resolvedHostnames).assertPublicImageReference('mysql:9')
        expect(resolvedHostnames).toEqual([])
    })

    test('공개 레지스트리 호스트는 broker 해석을 거쳐 통과한다', async () => {
        const resolvedHostnames: string[] = []
        await createService({ blocked: false }, resolvedHostnames).assertPublicImageReference('codeberg.org/forgejo/forgejo:16')
        expect(resolvedHostnames).toEqual(['codeberg.org'])
    })

    test('broker 가 blocked 로 판정하면 REGISTRY_HOST_INTERNAL 이다', async () => {
        await expect(createService({ blocked: true }).assertPublicImageReference('evil.example.com/image:1')).rejects.toMatchObject({
            code: 'REGISTRY_HOST_INTERNAL',
        })
    })

    test('정적 위반(localhost·사설 IP·단일 라벨)은 broker 호출 없이 거부한다', async () => {
        const resolvedHostnames: string[] = []
        const service = createService({ blocked: false }, resolvedHostnames)
        for (const reference of ['localhost:5000/image', '192.168.0.10/image', 'myregistry:5000/image']) {
            await expect(service.assertPublicImageReference(reference)).rejects.toMatchObject({ code: 'REGISTRY_HOST_INTERNAL' })
        }
        expect(resolvedHostnames).toEqual([])
    })

    test('공인 IP 리터럴 레지스트리는 DNS 해석 없이 통과한다', async () => {
        const resolvedHostnames: string[] = []
        await createService({ blocked: false }, resolvedHostnames).assertPublicImageReference('93.184.216.34:5000/image:1')
        expect(resolvedHostnames).toEqual([])
    })

    test('createContainer 도 같은 검증을 거친다', async () => {
        await expect(createService({ blocked: true }).createContainer({ image: 'evil.example.com/image:1', name: 'sample' })).rejects.toMatchObject({
            code: 'REGISTRY_HOST_INTERNAL',
        })
    })
})
