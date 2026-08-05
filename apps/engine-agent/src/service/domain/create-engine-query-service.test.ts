import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, statfs } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineQueryService } from './create-engine-query-service'

const directoriesToRemove: string[] = []

const createTemporaryDirectory = async () => mkdtemp(join(tmpdir(), 'engine-query-service-'))

const getExpectedFilesystemUsage = async (artifactRoot: string) => {
    const filesystem = await statfs(artifactRoot)
    const capacityBytes = filesystem.blocks * filesystem.bsize
    const availableBytes = filesystem.bavail * filesystem.bsize

    return {
        availableBytes,
        capacityBytes,
        usedBytes: capacityBytes - filesystem.bfree * filesystem.bsize,
    }
}

const createDockerEngineClientStub = () => ({
    changesContainer: async () => [{ kind: 'added' as const, path: '/tmp/file' }],
    topContainer: async () => ({ processes: [['1', 'bun']], titles: ['PID', 'CMD'] }),
    waitContainer: async () => ({ exitCode: 0 }),
    getContainerLogs: async () => ({ stderr: 'warning', stdout: 'ready', truncated: false }),
    getContainers: async () => [
        {
            Command: 'bun server.js',
            Created: 1_785_456_000,
            Id: 'container-id',
            Image: 'containers-api',
            ImageID: 'sha256:image-id',
            Labels: { secret: 'sensitive-label-value' },
            Names: ['/containers-api-1'],
            NetworkSettings: { Networks: { containers_edge: {} } },
            Ports: [{ PrivatePort: 8080, Type: 'tcp' }],
            State: 'running',
            Status: 'Up 5 minutes',
        },
    ],
    getDiskUsage: async () => ({
        BuildCache: [
            { ID: 'cache-a', InUse: false, Size: 10 },
            { ID: 'cache-b', InUse: true, Size: 20 },
        ],
        Containers: [
            { Id: 'container-a', SizeRw: 30, State: 'running' },
            { Id: 'container-b', SizeRw: 40, State: 'exited' },
        ],
        Images: [
            { Containers: 0, Id: 'image-a', SharedSize: 10, Size: 60 },
            { Containers: 1, Id: 'image-b', SharedSize: 0, Size: 70 },
        ],
        LayersSize: 100,
        Volumes: [
            { Name: 'volume-a', UsageData: { RefCount: 0, Size: 80 } },
            { Name: 'volume-b', UsageData: { RefCount: 1, Size: 90 } },
        ],
    }),
    getInfo: async () => ({
        Containers: 2,
        ContainersPaused: 0,
        ContainersRunning: 1,
        ContainersStopped: 1,
        DockerRootDir: '/var/lib/docker',
        ID: 'engine-id',
        Images: 2,
        MemTotal: 1_024,
        NCPU: 10,
        Name: 'docker-desktop',
        OperatingSystem: 'Docker Desktop',
    }),
    inspectContainer: async () => ({
        Args: ['server.js'],
        Config: {
            Cmd: ['bun', 'server.js'],
            Entrypoint: ['bun'],
            Env: ['SECRET=value', 'PORT=3001'],
            ExposedPorts: { '3001/tcp': {} },
            Hostname: 'api',
            Labels: { project: 'containers' },
            User: 'bun',
            WorkingDir: '/app',
        },
        Created: '2026-07-31T00:00:00.000Z',
        Id: 'container-id',
        Image: 'sha256:image-id',
        Mounts: [{ Destination: '/data', Mode: 'rw', Name: 'control-data', RW: true, Type: 'volume' }],
        Name: '/containers-api-1',
        NetworkSettings: { Networks: { ingress: { Gateway: '172.20.0.1', IPAddress: '172.20.0.2', MacAddress: '00:00:00:00:00:01' } } },
        Path: 'bun',
        Platform: 'linux',
        RestartCount: 1,
        State: {
            Error: '',
            ExitCode: 0,
            FinishedAt: '0001-01-01T00:00:00Z',
            Health: { Status: 'healthy' },
            Paused: false,
            Pid: 100,
            Restarting: false,
            Running: true,
            StartedAt: '2026-07-31T00:00:00Z',
            Status: 'running',
        },
    }),
    getVersion: async () => ({
        ApiVersion: '1.52',
        Arch: 'arm64',
        MinAPIVersion: '1.44',
        Os: 'linux',
        Version: '29.6.2',
    }),
})

describe('Engine 조회 서비스', () => {
    afterEach(async () => {
        for (const directory of directoriesToRemove) {
            await rm(directory, { force: true, recursive: true })
        }
        directoriesToRemove.length = 0
    })

    test('Docker 원문을 안정된 Engine 요약으로 변환합니다', async () => {
        const artifactRoot = await createTemporaryDirectory()
        directoriesToRemove.push(artifactRoot)
        const filesystem = await getExpectedFilesystemUsage(artifactRoot)
        const service = createEngineQueryService({
            dockerEngineClient: createDockerEngineClientStub(),
            artifactRoot,
        })
        const overview = await service.getOverview()

        expect(overview.version).toBe('29.6.2')
        expect(overview.containers).toEqual({ paused: 0, running: 1, stopped: 1, total: 2 })
        expect(overview.disk).toEqual({
            ...filesystem,
            buildCacheBytes: 30,
            containerWritableBytes: 70,
            estimatedReclaimableBytes: 180,
            layersBytes: 100,
            localVolumeBytes: 170,
        })
    })

    test('컨테이너 이름과 생성 시간을 정규화합니다', async () => {
        const artifactRoot = await createTemporaryDirectory()
        directoriesToRemove.push(artifactRoot)
        const service = createEngineQueryService({
            dockerEngineClient: createDockerEngineClientStub(),
            artifactRoot,
        })
        const containers = await service.getContainers()

        expect(containers[0]?.names).toEqual(['containers-api-1'])
        expect(containers[0]?.createdAt).toBe('2026-07-31T00:00:00.000Z')
        expect(containers[0]?.labelKeys).toEqual(['secret'])
        expect(JSON.stringify(containers[0])).not.toContain('sensitive-label-value')
    })

    test('inspect에서 secret 값은 제거하고 key와 runtime 상태만 반환합니다', async () => {
        const artifactRoot = await createTemporaryDirectory()
        directoriesToRemove.push(artifactRoot)
        const service = createEngineQueryService({
            dockerEngineClient: createDockerEngineClientStub(),
            artifactRoot,
        })
        const detail = await service.getContainer('container-id')

        expect(detail.environmentKeys).toEqual(['SECRET', 'PORT'])
        expect(JSON.stringify(detail)).not.toContain('value')
        expect(detail.state.health).toBe('healthy')
        expect(await service.getContainerLogs('container-id', { tail: 50 })).toEqual({ stderr: 'warning', stdout: 'ready', truncated: false })
    })
})
