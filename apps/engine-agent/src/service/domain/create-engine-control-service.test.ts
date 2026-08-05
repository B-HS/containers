import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineControlService } from './create-engine-control-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createClientStub = () => ({
    connectContainerNetwork: async () => undefined,
    createContainer: async () => ({ Id: 'created-container-id' }),
    createNetwork: async () => ({ Id: 'created-network-id' }),
    createVolume: async () => ({ Name: 'created-volume' }),
    disconnectContainerNetwork: async () => undefined,
    executeContainer: async () => ({ exitCode: 0, stderr: '', stdout: 'ok\n', truncated: false }),
    getContainers: async () => [
        {
            Command: 'bun server.js',
            Created: 1,
            Id: '1234567890abcdef',
            Image: 'containers-api',
            ImageID: 'sha256:image',
            Labels: {},
            Names: ['/containers-api-1'],
            NetworkSettings: { Networks: { containers_edge: {} } },
            Ports: [{ PrivatePort: 8080, Type: 'tcp' }],
            State: 'running',
            Status: 'Up',
        },
    ],
    getDiskUsage: async () => ({ BuildCache: [], Containers: [], Images: [], LayersSize: 0, Volumes: [] }),
    getImages: async () => [
        {
            Created: 1,
            Id: 'sha256:abcdef1234567890',
            RepoDigests: ['containers-api@sha256:digest'],
            RepoTags: ['containers-api:latest'],
            SharedSize: -1,
            Size: 100,
        },
    ],
    inspectContainer: async () => ({
        Args: [],
        Config: {
            Cmd: [],
            Entrypoint: [],
            Env: [],
            ExposedPorts: { '3000/tcp': {} },
            Hostname: 'workload-a',
            Labels: {},
            User: '',
            WorkingDir: '',
        },
        Created: '2026-08-01T00:00:00.000Z',
        Id: 'created-container-id',
        Image: 'sha256:image',
        Mounts: [],
        Name: '/workload-a',
        NetworkSettings: { Networks: {} },
        Path: '/app',
        Platform: 'linux',
        RestartCount: 0,
        State: {
            Error: '',
            ExitCode: 0,
            FinishedAt: '',
            Paused: false,
            Pid: 1,
            Restarting: false,
            Running: true,
            StartedAt: '2026-08-01T00:00:00.000Z',
            Status: 'running',
        },
    }),
    getNetworks: async () => [
        {
            Attachable: false,
            Containers: { container: {} },
            Driver: 'bridge',
            Id: 'network1234567890',
            Ingress: false,
            Internal: false,
            IPAM: { Config: [{ Gateway: '172.20.0.1', Subnet: '172.20.0.0/16' }] },
            Labels: { secret: 'sensitive-network-label' },
            Name: 'containers-control',
            Scope: 'local',
        },
    ],
    getVolumes: async () => [
        {
            CreatedAt: '2026-01-01T00:00:00Z',
            Driver: 'local',
            Labels: { secret: 'sensitive-volume-label' },
            Name: 'containers-data',
            Options: { device: '/private/path' },
            Scope: 'local',
            UsageData: { RefCount: 1, Size: -1 },
        },
    ],
    loadImageArchive: async () => ['Loaded image: example:latest'],
    performContainerAction: async () => undefined,
    pullImage: async (reference: string) => ({ messages: ['Status: Downloaded newer image'], reference }),
    pruneBuildCache: async (ids: string[]) => ({ deletedIds: ids, spaceReclaimed: 0 }),
    removeImage: async () => [],
    tagImage: async () => undefined,
    removeNetwork: async () => undefined,
    removeVolume: async () => undefined,
})

describe('Engine 제어 서비스', () => {
    test('컨테이너 생성은 격리·리소스 입력 계약을 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(service.createContainer({ autoStart: false, image: 'containers-e2e:latest', name: 'workload-a' })).resolves.toEqual({
            operation: 'create-container',
            targetId: 'created-container-id',
        })
        await expect(service.createContainer({ environment: ['INVALID'], image: 'containers-e2e:latest', name: 'workload-a' })).rejects.toThrow()
        await expect(service.createContainer({ image: 'containers-e2e:latest', memoryBytes: 1_024, name: 'workload-a' })).rejects.toThrow()
    })

    test('컨테이너 network 전환과 bounded HTTP health probe를 검증합니다', async () => {
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: createClientStub(),
            fetcher: async () => new Response(null, { status: 204 }),
        })

        await expect(service.connectContainerNetwork('containers-api-1', { network: 'containers_edge' })).resolves.toEqual({
            operation: 'connect-network',
            targetId: '1234567890abcdef',
        })
        await expect(service.disconnectContainerNetwork('1234567890', { network: 'containers_control' })).resolves.toEqual({
            operation: 'disconnect-network',
            targetId: '1234567890abcdef',
        })
        await expect(service.connectContainerNetwork('unknown-container', { network: 'containers_edge' })).rejects.toThrow('DOCKER_NOT_FOUND')
        await expect(service.probeContainer('created-container-id', { path: '/health', port: 3000, timeoutMs: 1_000 })).resolves.toMatchObject({
            error: null,
            healthy: true,
            statusCode: 204,
        })
        await expect(service.probeContainer('created-container-id', { path: 'https://invalid', port: 3000 })).rejects.toThrow()
    })

    test('컨테이너 삭제는 대상명 재입력을 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(
            service.performContainerAction('1234567890abcdef', {
                action: 'remove',
                confirmation: 'wrong-name',
                force: false,
                removeVolumes: false,
            }),
        ).rejects.toThrow('CONFIRMATION_MISMATCH')
        await expect(
            service.performContainerAction('1234567890abcdef', {
                action: 'remove',
                confirmation: 'containers-api-1',
                force: false,
                removeVolumes: false,
            }),
        ).resolves.toEqual({ operation: 'remove', targetId: '1234567890abcdef' })
    })

    test('이미지 삭제는 tag 재입력을 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(
            service.removeImage('abcdef1234567890', {
                confirmation: 'containers-api:latest',
                force: false,
                pruneChildren: false,
            }),
        ).resolves.toEqual({ operation: 'remove-image', targetId: 'sha256:abcdef1234567890' })
    })

    test('인증 pull은 credential ID를 Agent에서 해석해 Docker auth header로만 전달합니다', async () => {
        let receivedAuth: string | undefined
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: {
                ...createClientStub(),
                pullImage: async (reference: string, registryAuth?: string) => {
                    receivedAuth = registryAuth
                    return { messages: ['Pulled'], reference }
                },
            },
            registryCredentialService: {
                getRegistryAuth: async (credentialId, reference) => `${credentialId}:${reference}`,
            },
            resolveHost: async () => ({ addresses: ['93.184.216.34'] }),
        })

        await expect(
            service.pullImage({ credentialId: 'd7506e8c-9442-4cc0-9f58-27b55693bb1b', reference: 'registry.example.com/team/image:1' }),
        ).resolves.toEqual({ messages: ['Pulled'], reference: 'registry.example.com/team/image:1' })
        expect(receivedAuth).toBe('d7506e8c-9442-4cc0-9f58-27b55693bb1b:registry.example.com/team/image:1')
    })

    test('관리 plane 컨테이너와 그 이미지는 일반 변경·삭제 경로에서 보호합니다', async () => {
        const client = createClientStub()
        const protectedClient = {
            ...client,
            getContainers: async () =>
                (await client.getContainers()).map((container) => ({
                    ...container,
                    ImageID: 'sha256:abcdef1234567890',
                    Labels: { 'com.docker.compose.project': 'containers' },
                })),
        }
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: protectedClient })

        await expect(service.performContainerAction('1234567890abcdef', { action: 'kill' })).rejects.toThrow('MANAGEMENT_RESOURCE_PROTECTED')
        await expect(
            service.removeImage('abcdef1234567890', {
                confirmation: 'containers-api:latest',
                force: true,
                pruneChildren: false,
            }),
        ).rejects.toThrow('MANAGEMENT_RESOURCE_PROTECTED')
        await expect(service.getImageRemovalImpact('abcdef1234567890')).resolves.toMatchObject({
            containers: [{ id: '1234567890abcdef', isManagementPlane: true }],
            isManagementPlane: true,
        })
    })

    test('관리 plane 이미지는 재태그할 수 없고 제어 plane repository도 선점할 수 없습니다', async () => {
        const client = createClientStub()
        const managementClient = {
            ...client,
            getContainers: async () =>
                (await client.getContainers()).map((container) => ({
                    ...container,
                    ImageID: 'sha256:abcdef1234567890',
                    Labels: { 'com.docker.compose.project': 'containers' },
                })),
            getImages: async () => [
                ...(await client.getImages()),
                { Created: 1, Id: 'sha256:99887766554433', RepoDigests: [], RepoTags: ['workload:latest'], SharedSize: 0, Size: 10 },
            ],
        }
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: managementClient })

        await expect(service.tagImage('abcdef1234567890', { repository: 'evil', tag: 'latest' })).rejects.toThrow('MANAGEMENT_RESOURCE_PROTECTED')
        await expect(service.tagImage('99887766554433', { repository: 'containers-api', tag: 'latest' })).rejects.toThrow(
            'MANAGEMENT_RESOURCE_PROTECTED',
        )
        await expect(service.tagImage('99887766554433', { repository: 'containers-api/extra', tag: 'latest' })).rejects.toThrow(
            'MANAGEMENT_RESOURCE_PROTECTED',
        )
    })

    test('이미지 태그는 해석된 canonical ID로 Docker에 전달하고 미해석 참조는 거부합니다', async () => {
        const calls: string[] = []
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: {
                ...createClientStub(),
                tagImage: async (imageId: string) => {
                    calls.push(imageId)
                },
            },
        })

        await expect(service.tagImage('abcdef1234', { repository: 'workload', tag: 'v1' })).resolves.toEqual({
            operation: 'tag-image',
            targetId: 'workload:v1',
        })
        expect(calls).toEqual(['sha256:abcdef1234567890'])
        await expect(service.tagImage('ffffffffffff', { repository: 'workload', tag: 'v1' })).rejects.toThrow('DOCKER_NOT_FOUND')
    })

    test('이미지 참조는 suffix로 매칭하지 않고 모호한 prefix는 거부합니다', async () => {
        const client = createClientStub()
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: {
                ...client,
                getImages: async () => [
                    ...(await client.getImages()),
                    { Created: 1, Id: 'sha256:abcdef1234000000', RepoDigests: [], RepoTags: [], SharedSize: 0, Size: 10 },
                ],
            },
        })

        await expect(service.getImageRemovalImpact('1234567890')).rejects.toThrow('DOCKER_NOT_FOUND')
        await expect(service.getImageRemovalImpact('abcdef1234')).rejects.toThrow('AMBIGUOUS_REFERENCE')
    })

    test('Docker의 알 수 없는 shared size는 0으로 정규화합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(service.getImages()).resolves.toEqual([
            {
                createdAt: '1970-01-01T00:00:01.000Z',
                id: 'sha256:abcdef1234567890',
                repoDigests: ['containers-api@sha256:digest'],
                repoTags: ['containers-api:latest'],
                sharedSizeBytes: 0,
                sizeBytes: 100,
            },
        ])
    })

    test('네트워크와 볼륨의 민감 label·option 값은 제거하고 삭제 확인문구를 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })
        const networks = await service.getNetworks()
        const volumes = await service.getVolumes()

        expect(networks[0]?.labelKeys).toEqual(['secret'])
        expect(volumes[0]?.optionKeys).toEqual(['device'])
        expect(volumes[0]?.sizeBytes).toBe(0)
        expect(JSON.stringify({ networks, volumes })).not.toContain('sensitive-network-label')
        expect(JSON.stringify({ networks, volumes })).not.toContain('/private/path')
        await expect(service.removeNetwork('network1234', { confirmation: 'wrong', force: false })).rejects.toThrow('CONFIRMATION_MISMATCH')
        await expect(service.removeNetwork('network1234', { confirmation: 'containers-control', force: false })).resolves.toEqual({
            operation: 'remove-network',
            targetId: 'network1234567890',
        })
        await expect(service.removeVolume('containers-data', { confirmation: 'containers-data', force: false })).resolves.toEqual({
            operation: 'remove-volume',
            targetId: 'containers-data',
        })
    })

    test('네트워크와 볼륨 생성 입력을 제한된 기본 driver로 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(service.createNetwork({ name: 'workload-edge' })).resolves.toEqual({
            operation: 'create-network',
            targetId: 'created-network-id',
        })
        await expect(service.createNetwork({ gateway: '172.30.0.1', name: 'invalid-gateway' })).rejects.toThrow()
        await expect(service.createVolume({ name: 'workload-data' })).resolves.toEqual({
            operation: 'create-volume',
            targetId: 'created-volume',
        })
        await expect(service.createVolume({ driver: 'nfs', name: 'unsafe-volume' })).rejects.toThrow()
    })

    test('관리 plane 네트워크와 볼륨은 직접 삭제 경로에서도 보호합니다', async () => {
        const client = createClientStub()
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: {
                ...client,
                getNetworks: async () =>
                    (await client.getNetworks()).map((network) => ({ ...network, Labels: { 'com.docker.compose.project': 'containers' } })),
                getVolumes: async () =>
                    (await client.getVolumes()).map((volume) => ({ ...volume, Labels: { 'com.docker.compose.project': 'containers' } })),
            },
        })

        await expect(service.removeNetwork('network1234', { confirmation: 'containers-control', force: false })).rejects.toThrow(
            'MANAGEMENT_RESOURCE_PROTECTED',
        )
        await expect(service.removeVolume('containers-data', { confirmation: 'containers-data', force: false })).rejects.toThrow(
            'MANAGEMENT_RESOURCE_PROTECTED',
        )
    })

    test('prune preview는 관리 plane과 사용 중 리소스를 제외하고 volume을 명시적으로 선택합니다', async () => {
        const client = createClientStub()
        const service = createEngineControlService({
            artifactRoot: '/artifacts',
            dockerEngineClient: {
                ...client,
                getContainers: async () => [
                    ...(await client.getContainers()).map((container) => ({
                        ...container,
                        ImageID: 'sha256:management-image',
                        Labels: { 'com.docker.compose.project': 'containers' },
                        State: 'exited',
                    })),
                    {
                        ...(await client.getContainers())[0]!,
                        Id: 'workload-container',
                        ImageID: 'sha256:workload-image',
                        Labels: {},
                        Names: ['/workload'],
                        NetworkSettings: { Networks: { containers_edge: {} } },
                        Ports: [{ PrivatePort: 8080, Type: 'tcp' }],
                        State: 'exited',
                    },
                ],
                getDiskUsage: async () => ({
                    BuildCache: [{ ID: 'cache-unused', InUse: false, Size: 5 }],
                    Containers: [{ Id: 'workload-container', SizeRw: 10, State: 'exited' }],
                    Images: [{ Containers: 0, Id: 'sha256:dangling', SharedSize: 2, Size: 22 }],
                    LayersSize: 100,
                    Volumes: [{ Name: 'workload-volume', UsageData: { RefCount: 0, Size: 30 } }],
                }),
                getImages: async () => [
                    { Created: 1, Id: 'sha256:management-image', RepoDigests: [], RepoTags: [], SharedSize: 0, Size: 100 },
                    { Created: 1, Id: 'sha256:dangling', RepoDigests: [], RepoTags: [], SharedSize: 2, Size: 22 },
                ],
                getNetworks: async () => [
                    { ...(await client.getNetworks())[0]!, Containers: {}, Labels: { 'com.docker.compose.project': 'containers' } },
                    { ...(await client.getNetworks())[0]!, Containers: {}, Id: 'workload-network', Labels: {}, Name: 'workload-edge' },
                ],
                getVolumes: async () => [
                    {
                        ...(await client.getVolumes())[0]!,
                        Labels: { 'com.docker.compose.project': 'containers' },
                        UsageData: { RefCount: 0, Size: 50 },
                    },
                    { ...(await client.getVolumes())[0]!, Labels: {}, Name: 'workload-volume', UsageData: { RefCount: 0, Size: 30 } },
                ],
            },
        })

        const withoutVolumes = await service.getPrunePreview({})
        const withVolumes = await service.getPrunePreview({ includeVolumes: true })

        expect(withoutVolumes.volumes).toEqual([])
        expect(withVolumes.containers.map((candidate) => candidate.id)).toEqual(['workload-container'])
        expect(withVolumes.images.map((candidate) => candidate.id)).toEqual(['sha256:dangling'])
        expect(withVolumes.networks.map((candidate) => candidate.id)).toEqual(['workload-network'])
        expect(withVolumes.volumes.map((candidate) => candidate.id)).toEqual(['workload-volume'])
        expect(withVolumes.protectedResourceCount).toBe(4)
        expect(withVolumes.reclaimableBytes).toBe(65)
        expect(withVolumes.sha256).toMatch(/^[a-f0-9]{64}$/)
        await expect(service.pruneBuildCache({ ids: ['cache-unused'] })).resolves.toEqual({
            deletedIds: ['cache-unused'],
            spaceReclaimed: 0,
        })
    })

    test('exec 입력과 결과를 contract로 검증합니다', async () => {
        const service = createEngineControlService({ artifactRoot: '/artifacts', dockerEngineClient: createClientStub() })

        await expect(service.executeContainer('1234567890abcdef', { command: ['printf', 'ok'] })).resolves.toEqual({
            exitCode: 0,
            stderr: '',
            stdout: 'ok\n',
            truncated: false,
        })
    })

    test('ready root 안의 일반 파일만 Docker image load에 전달합니다', async () => {
        const root = await mkdtemp(join(tmpdir(), 'containers-agent-artifact-'))
        temporaryDirectories.push(root)
        const readyRoot = join(root, 'ready')
        const artifactId = '01958c26-65b5-7c22-9254-03b914e61cc5'
        const artifactPath = join(readyRoot, `${artifactId}.archive`)
        await mkdir(readyRoot)
        await writeFile(artifactPath, 'archive')
        const service = createEngineControlService({ artifactRoot: root, dockerEngineClient: createClientStub() })

        await expect(service.loadImage({ artifactPath })).resolves.toEqual({
            messages: ['Loaded image: example:latest'],
            operation: 'load-image',
            targetId: artifactId,
        })
        await expect(service.loadImage({ artifactPath: '/tmp/outside.archive' })).rejects.toThrow()
    })
})
