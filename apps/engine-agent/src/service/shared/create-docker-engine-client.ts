import { request as createHttpRequest } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import type { Duplex, Readable } from 'node:stream'
import { z } from 'zod'
import type {
    ContainerAction,
    ContainerCreateRequest,
    ContainerExecRequest,
    InteractiveExecTicketRequest,
    NetworkCreateRequest,
    VolumeCreateRequest,
} from '@containers/contracts/engine-control'
import { createAppError } from '../../lib/error'

const DOCKER_REQUEST_TIMEOUT_MS = 5_000
const DOCKER_MAX_JSON_BYTES = 33_554_432
const DOCKER_IMAGE_LOAD_TIMEOUT_MS = 10 * 60 * 1_000
const DOCKER_IMAGE_PULL_INACTIVITY_TIMEOUT_MS = 120_000
const DOCKER_MEMORY_SWAP_MULTIPLIER = 2
const DOCKER_PULL_MESSAGE_LIMIT = 20

const dockerVersionSchema = z.object({
    ApiVersion: z.string().min(1),
    Arch: z.string().min(1),
    MinAPIVersion: z.string().min(1),
    Os: z.string().min(1),
    Version: z.string().min(1),
})

const dockerInfoSchema = z.object({
    Containers: z.number().int().nonnegative(),
    ContainersPaused: z.number().int().nonnegative(),
    ContainersRunning: z.number().int().nonnegative(),
    ContainersStopped: z.number().int().nonnegative(),
    DockerRootDir: z.string().min(1),
    ID: z.string().min(1),
    Images: z.number().int().nonnegative(),
    MemTotal: z.number().int().nonnegative(),
    NCPU: z.number().int().nonnegative(),
    Name: z.string().min(1),
    OperatingSystem: z.string().min(1),
})

const dockerDiskUsageSchema = z.object({
    BuildCache: z
        .array(
            z.object({
                ID: z.string().min(1),
                InUse: z.boolean(),
                Size: z.number().int().nonnegative(),
            }),
        )
        .nullish()
        .transform((value) => value ?? []),
    Containers: z
        .array(
            z.object({
                Id: z.string().min(1),
                SizeRw: z
                    .number()
                    .int()
                    .nonnegative()
                    .nullish()
                    .transform((value) => value ?? 0),
                State: z.string(),
            }),
        )
        .nullish()
        .transform((value) => value ?? []),
    Images: z
        .array(
            z.object({
                Containers: z.number().int(),
                Id: z.string().min(1),
                SharedSize: z.number().int(),
                Size: z.number().int().nonnegative(),
            }),
        )
        .nullish()
        .transform((value) => value ?? []),
    LayersSize: z.number().int().nonnegative(),
    Volumes: z
        .array(
            z.object({
                Name: z.string().min(1),
                UsageData: z
                    .object({
                        RefCount: z.number().int(),
                        Size: z.number().int().nonnegative(),
                    })
                    .nullish(),
            }),
        )
        .nullish()
        .transform((value) => value ?? []),
})

const dockerContainerSummarySchema = z.object({
    Command: z.string(),
    Created: z.number().int().nonnegative(),
    Id: z.string().min(1),
    Image: z.string().min(1),
    ImageID: z.string().min(1),
    Labels: z
        .record(z.string(), z.string())
        .nullish()
        .transform((value) => value ?? {}),
    Names: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? []),
    State: z.string().min(1),
    Status: z.string().min(1),
})

const dockerContainerSummaryListSchema = z.array(dockerContainerSummarySchema)

const dockerContainerInspectSchema = z.object({
    Args: z.array(z.string()),
    Config: z.object({
        Cmd: z
            .array(z.string())
            .nullish()
            .transform((value) => value ?? []),
        Entrypoint: z
            .array(z.string())
            .nullish()
            .transform((value) => value ?? []),
        Env: z
            .array(z.string())
            .nullish()
            .transform((value) => value ?? []),
        ExposedPorts: z
            .record(z.string(), z.unknown())
            .nullish()
            .transform((value) => value ?? {}),
        Hostname: z.string(),
        Labels: z
            .record(z.string(), z.string())
            .nullish()
            .transform((value) => value ?? {}),
        User: z.string(),
        WorkingDir: z.string(),
    }),
    Created: z.string(),
    Id: z.string().min(1),
    Image: z.string(),
    Mounts: z
        .array(
            z.object({
                Destination: z.string(),
                Mode: z.string(),
                Name: z.string().optional(),
                RW: z.boolean(),
                Type: z.string(),
            }),
        )
        .default([]),
    Name: z.string(),
    NetworkSettings: z.object({
        Networks: z
            .record(
                z.string(),
                z.object({
                    Gateway: z.string(),
                    IPAddress: z.string(),
                    MacAddress: z.string(),
                }),
            )
            .nullish()
            .transform((value) => value ?? {}),
    }),
    Path: z.string(),
    Platform: z.string(),
    RestartCount: z.number().int().nonnegative(),
    State: z.object({
        Error: z.string(),
        ExitCode: z.number().int(),
        FinishedAt: z.string(),
        Health: z.object({ Status: z.string() }).optional(),
        Paused: z.boolean(),
        Pid: z.number().int().nonnegative(),
        Restarting: z.boolean(),
        Running: z.boolean(),
        StartedAt: z.string(),
        Status: z.string(),
    }),
})

const dockerImageSummaryListSchema = z.array(
    z.object({
        Created: z.number().int().nonnegative(),
        Id: z.string().min(1),
        RepoDigests: z
            .array(z.string())
            .nullish()
            .transform((value) => value ?? []),
        RepoTags: z
            .array(z.string())
            .nullish()
            .transform((value) => value ?? []),
        SharedSize: z
            .number()
            .int()
            .nullish()
            .transform((value) => value ?? 0),
        Size: z.number().int().nonnegative(),
    }),
)

const dockerNetworkSummarySchema = z.object({
    Attachable: z.boolean(),
    Containers: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform((value) => value ?? {}),
    Driver: z.string(),
    Id: z.string().min(1),
    Ingress: z.boolean(),
    Internal: z.boolean(),
    IPAM: z.object({
        Config: z
            .array(z.object({ Gateway: z.string().optional(), Subnet: z.string().optional() }))
            .nullish()
            .transform((value) => value ?? []),
    }),
    Labels: z
        .record(z.string(), z.string())
        .nullish()
        .transform((value) => value ?? {}),
    Name: z.string().min(1),
    Scope: z.string(),
})

const dockerNetworkSummaryListSchema = z.array(dockerNetworkSummarySchema)

const dockerVolumeSummaryListSchema = z.object({
    Volumes: z
        .array(
            z.object({
                CreatedAt: z.string().optional(),
                Driver: z.string(),
                Labels: z
                    .record(z.string(), z.string())
                    .nullish()
                    .transform((value) => value ?? {}),
                Name: z.string().min(1),
                Options: z
                    .record(z.string(), z.string())
                    .nullish()
                    .transform((value) => value ?? {}),
                Scope: z.string(),
                UsageData: z
                    .object({ RefCount: z.number().int(), Size: z.number().int() })
                    .nullish()
                    .transform((value) => value ?? { RefCount: -1, Size: 0 }),
            }),
        )
        .nullish()
        .transform((value) => value ?? []),
})

const dockerExecCreateSchema = z.object({ Id: z.string().min(1) })
const dockerContainerCreateSchema = z.object({ Id: z.string().min(1) })
const dockerNetworkCreateSchema = z.object({ Id: z.string().min(1) })
const dockerVolumeCreateSchema = z.object({ Name: z.string().min(1) })
const dockerExecInspectSchema = z.object({
    ExitCode: z
        .number()
        .int()
        .nullish()
        .transform((value) => value ?? -1),
})

const dockerImageLoadMessageSchema = z.object({
    error: z.string().optional(),
    stream: z.string().optional(),
})

const dockerBuildCachePruneResultSchema = z.object({
    CachesDeleted: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? []),
    SpaceReclaimed: z.number().int().nonnegative(),
})

type DockerEngineClientDependencies = {
    socketPath: string
}

type DockerRequestOptions = {
    body?: string
    expectedStatuses?: number[]
    headers?: Record<string, string>
    maxStoredBytes?: number
    method?: 'DELETE' | 'GET' | 'POST'
    path: string
    timeoutMs?: number
}

const requestDockerEngine = (
    socketPath: string,
    {
        body = '',
        expectedStatuses = [200],
        headers: additionalHeaders = {},
        maxStoredBytes = DOCKER_MAX_JSON_BYTES,
        method = 'GET',
        path,
        timeoutMs = DOCKER_REQUEST_TIMEOUT_MS,
    }: DockerRequestOptions,
) =>
    new Promise<{ body: Buffer; truncated: boolean }>((resolve, reject) => {
        const headers = {
            ...additionalHeaders,
            ...(body.length > 0 ? { 'content-length': Buffer.byteLength(body), 'content-type': 'application/json' } : {}),
        }
        const request = createHttpRequest({ headers, method, path, socketPath }, (response) => {
            const chunks: Uint8Array[] = []
            let storedBytes = 0
            let truncated = false

            response.on('data', (chunk: Uint8Array) => {
                if (storedBytes < maxStoredBytes) {
                    const remainingBytes = maxStoredBytes - storedBytes
                    const storedChunk = chunk.byteLength <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes)
                    chunks.push(storedChunk)
                    storedBytes += storedChunk.byteLength
                }

                truncated ||= storedBytes < chunk.byteLength || storedBytes >= maxStoredBytes
            })
            response.on('end', () => {
                if (!expectedStatuses.includes(response.statusCode ?? 0)) {
                    reject(createAppError(`Docker Engine 응답 코드: ${response.statusCode ?? 'unknown'} ${Buffer.concat(chunks).toString('utf8')}`))
                    return
                }

                resolve({ body: Buffer.concat(chunks), truncated })
            })
        })

        request.setTimeout(timeoutMs, () => request.destroy(createAppError('Docker Engine 요청 시간이 초과되었습니다.')))
        request.on('error', reject)
        if (body.length > 0) {
            request.write(body)
        }
        request.end()
    })

const requestDockerEngineFile = async (socketPath: string, path: string, filePath: string) => {
    const file = await stat(filePath)

    return new Promise<{ body: Buffer; truncated: boolean }>((resolve, reject) => {
        const request = createHttpRequest(
            {
                headers: { 'content-length': file.size, 'content-type': 'application/x-tar' },
                method: 'POST',
                path,
                socketPath,
            },
            (response) => {
                const chunks: Uint8Array[] = []
                let storedBytes = 0
                let truncated = false

                response.on('data', (chunk: Uint8Array) => {
                    if (storedBytes < DOCKER_MAX_JSON_BYTES) {
                        const remainingBytes = DOCKER_MAX_JSON_BYTES - storedBytes
                        const storedChunk = chunk.byteLength <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes)
                        chunks.push(storedChunk)
                        storedBytes += storedChunk.byteLength
                    }
                    truncated ||= storedBytes < chunk.byteLength || storedBytes >= DOCKER_MAX_JSON_BYTES
                })
                response.on('end', () => {
                    const body = Buffer.concat(chunks)
                    if (response.statusCode !== 200) {
                        reject(createAppError(`Docker Engine 응답 코드: ${response.statusCode ?? 'unknown'} ${body.toString('utf8')}`))
                        return
                    }
                    resolve({ body, truncated })
                })
            },
        )
        const stream = createReadStream(filePath)
        request.setTimeout(DOCKER_IMAGE_LOAD_TIMEOUT_MS, () => request.destroy(createAppError('Docker image load 시간이 초과되었습니다.')))
        request.on('error', reject)
        stream.on('error', (error) => request.destroy(error))
        stream.pipe(request)
    })
}

const requestDockerEngineUpgrade = (socketPath: string, path: string, body: string) =>
    new Promise<Duplex>((resolve, reject) => {
        const socket = createConnection(socketPath)
        let responseBytes = Buffer.alloc(0)

        const cleanUpHandshake = () => {
            socket.setTimeout(0)
            socket.off('data', onData)
            socket.off('error', onError)
        }
        const fail = (error: Error) => {
            cleanUpHandshake()
            socket.destroy()
            reject(error)
        }
        const onError = (error: Error) => fail(error)
        const onData = (chunk: Buffer) => {
            responseBytes = Buffer.concat([responseBytes, chunk])
            if (responseBytes.byteLength > 65_536) {
                fail(createAppError('Docker Engine upgrade 응답 헤더가 너무 큽니다.'))
                return
            }
            const headerEnd = responseBytes.indexOf('\r\n\r\n')
            if (headerEnd < 0) {
                return
            }
            const header = responseBytes.subarray(0, headerEnd).toString('utf8')
            const statusCode = Number(header.split('\r\n', 1)[0]?.split(' ')[1])
            if (statusCode !== 101) {
                fail(createAppError(`Docker Engine upgrade 응답 코드: ${Number.isFinite(statusCode) ? statusCode : 'unknown'}`))
                return
            }
            const head = responseBytes.subarray(headerEnd + 4)
            cleanUpHandshake()
            socket.pause()
            if (head.byteLength > 0) {
                socket.unshift(head)
            }
            resolve(socket)
        }

        socket.setTimeout(30_000, () => fail(createAppError('Docker interactive exec 연결 시간이 초과되었습니다.')))
        socket.on('error', onError)
        socket.on('data', onData)
        socket.on('connect', () => {
            const request = [
                `POST ${path} HTTP/1.1`,
                'Host: localhost',
                'Connection: Upgrade',
                'Upgrade: tcp',
                'Content-Type: application/json',
                `Content-Length: ${Buffer.byteLength(body)}`,
                '',
                body,
            ].join('\r\n')
            socket.write(request)
        })
    })

const requestDockerEngineStream = (socketPath: string, path: string) =>
    new Promise<Readable>((resolve, reject) => {
        const request = createHttpRequest({ method: 'GET', path, socketPath }, (response) => {
            if (response.statusCode !== 200) {
                const chunks: Uint8Array[] = []
                response.on('data', (chunk: Uint8Array) => chunks.push(chunk))
                response.on('end', () =>
                    reject(createAppError(`Docker Engine 응답 코드: ${response.statusCode ?? 'unknown'} ${Buffer.concat(chunks).toString('utf8')}`)),
                )
                return
            }
            resolve(response)
        })
        request.setTimeout(DOCKER_REQUEST_TIMEOUT_MS, () => {
            request.destroy(createAppError('Docker Engine stream 연결 시간이 초과되었습니다.'))
        })
        request.on('response', () => request.setTimeout(0))
        request.on('error', reject)
        request.end()
    })

const parseJsonResponse = async <TSchema extends z.ZodType>(schema: TSchema, response: Promise<{ body: Buffer; truncated: boolean }>) =>
    schema.parse(JSON.parse((await response).body.toString('utf8')))

const parseMultiplexedOutput = (buffer: Buffer) => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let offset = 0

    while (offset + 8 <= buffer.length) {
        const stream = buffer[offset]
        const frameLength = buffer.readUInt32BE(offset + 4)
        const frameStart = offset + 8
        const frameEnd = frameStart + frameLength

        if (frameEnd > buffer.length) {
            break
        }

        if (stream === 2) {
            stderrChunks.push(buffer.subarray(frameStart, frameEnd))
        } else {
            stdoutChunks.push(buffer.subarray(frameStart, frameEnd))
        }

        offset = frameEnd
    }

    return {
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    }
}

export const createDockerEngineClient = ({ socketPath }: DockerEngineClientDependencies) => {
    let apiVersion: string | undefined

    const getVersion = async () => {
        const version = await parseJsonResponse(dockerVersionSchema, requestDockerEngine(socketPath, { path: '/version' }))
        apiVersion = version.ApiVersion
        return version
    }

    const getVersionedPath = async (path: string) => `/v${apiVersion ?? (await getVersion()).ApiVersion}${path}`

    return {
        createContainer: async (input: ContainerCreateRequest) => {
            const exposedPorts = input.containerPort ? { [`${input.containerPort}/tcp`]: {} } : {}
            const created = await parseJsonResponse(
                dockerContainerCreateSchema,
                requestDockerEngine(socketPath, {
                    body: JSON.stringify({
                        Cmd: input.command.length > 0 ? input.command : undefined,
                        Entrypoint: input.entrypoint.length > 0 ? input.entrypoint : undefined,
                        Env: input.environment,
                        ExposedPorts: exposedPorts,
                        HostConfig: {
                            AutoRemove: false,
                            Binds: input.volumes.map((volume) => `${volume.name}:${volume.mountPath}:${volume.readOnly ? 'ro' : 'rw'}`),
                            CapDrop: ['ALL'],
                            Memory: input.memoryBytes,
                            NanoCpus: input.nanoCpus,
                            NetworkMode: input.network,
                            PidsLimit: input.pidsLimit,
                            ReadonlyRootfs: input.readOnlyRootFilesystem,
                            RestartPolicy: { Name: input.restartPolicy },
                            SecurityOpt: ['no-new-privileges:true'],
                            Tmpfs: input.readOnlyRootFilesystem ? { '/tmp': 'rw,noexec,nosuid,size=67108864' } : undefined,
                        },
                        Image: input.image,
                        Labels: input.labels,
                        User: input.user,
                        WorkingDir: input.workingDirectory,
                    }),
                    expectedStatuses: [201],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/create?name=${encodeURIComponent(input.name)}`),
                }),
            )

            if (input.autoStart) {
                try {
                    await requestDockerEngine(socketPath, {
                        expectedStatuses: [204, 304],
                        method: 'POST',
                        path: await getVersionedPath(`/containers/${encodeURIComponent(created.Id)}/start`),
                    })
                } catch (error) {
                    try {
                        await requestDockerEngine(socketPath, {
                            expectedStatuses: [204],
                            method: 'DELETE',
                            path: await getVersionedPath(`/containers/${encodeURIComponent(created.Id)}?force=1&v=1`),
                        })
                    } catch {
                        throw new AggregateError([error], `컨테이너 시작 실패 후 정리할 수 없습니다: ${created.Id}`)
                    }
                    throw error
                }
            }

            return created
        },
        connectContainerNetwork: async (containerId: string, network: string) => {
            await requestDockerEngine(socketPath, {
                body: JSON.stringify({ Container: containerId }),
                expectedStatuses: [200],
                method: 'POST',
                path: await getVersionedPath(`/networks/${encodeURIComponent(network)}/connect`),
            })
        },
        disconnectContainerNetwork: async (containerId: string, network: string) => {
            await requestDockerEngine(socketPath, {
                body: JSON.stringify({ Container: containerId, Force: false }),
                expectedStatuses: [200],
                method: 'POST',
                path: await getVersionedPath(`/networks/${encodeURIComponent(network)}/disconnect`),
            })
        },
        createNetwork: async (input: NetworkCreateRequest) =>
            parseJsonResponse(
                dockerNetworkCreateSchema,
                requestDockerEngine(socketPath, {
                    body: JSON.stringify({
                        Attachable: input.attachable,
                        Driver: input.driver,
                        Internal: input.internal,
                        IPAM: input.subnet ? { Config: [{ Gateway: input.gateway, Subnet: input.subnet }] } : undefined,
                        Name: input.name,
                    }),
                    expectedStatuses: [201],
                    method: 'POST',
                    path: await getVersionedPath('/networks/create'),
                }),
            ),
        createVolume: async (input: VolumeCreateRequest) =>
            parseJsonResponse(
                dockerVolumeCreateSchema,
                requestDockerEngine(socketPath, {
                    body: JSON.stringify({ Driver: input.driver, Name: input.name }),
                    expectedStatuses: [201],
                    method: 'POST',
                    path: await getVersionedPath('/volumes/create'),
                }),
            ),
        getContainers: async () =>
            parseJsonResponse(
                dockerContainerSummaryListSchema,
                requestDockerEngine(socketPath, { path: await getVersionedPath('/containers/json?all=true') }),
            ),
        inspectContainer: async (containerId: string) =>
            parseJsonResponse(
                dockerContainerInspectSchema,
                requestDockerEngine(socketPath, {
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/json`),
                }),
            ),
        getContainerLogs: async (containerId: string, tail: number, since?: number) => {
            const inspect = await parseJsonResponse(
                z.object({ Config: z.object({ Tty: z.boolean() }) }),
                requestDockerEngine(socketPath, {
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/json`),
                }),
            )
            const sinceQuery = since === undefined ? '' : `&since=${since}`
            const response = await requestDockerEngine(socketPath, {
                maxStoredBytes: 8_388_608,
                path: await getVersionedPath(
                    `/containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}${sinceQuery}`,
                ),
            })
            return {
                ...(inspect.Config.Tty ? { stderr: '', stdout: response.body.toString('utf8') } : parseMultiplexedOutput(response.body)),
                truncated: response.truncated,
            }
        },
        getDiskUsage: async () =>
            parseJsonResponse(dockerDiskUsageSchema, requestDockerEngine(socketPath, { path: await getVersionedPath('/system/df') })),
        openEventStream: async () => requestDockerEngineStream(socketPath, await getVersionedPath('/events')),
        openContainerLogStream: async (containerId: string, tail: number) => {
            const inspect = await parseJsonResponse(
                z.object({ Config: z.object({ Tty: z.boolean() }) }),
                requestDockerEngine(socketPath, {
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/json`),
                }),
            )
            const stream = await requestDockerEngineStream(
                socketPath,
                await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/logs?follow=1&stdout=1&stderr=1&tail=${tail}`),
            )
            return { stream, tty: inspect.Config.Tty }
        },
        openContainerStatsStream: async (containerId: string) =>
            requestDockerEngineStream(socketPath, await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/stats?stream=1`)),
        getImages: async () =>
            parseJsonResponse(
                dockerImageSummaryListSchema,
                requestDockerEngine(socketPath, { path: await getVersionedPath('/images/json?all=true') }),
            ),
        getNetworks: async () => {
            const networks = await parseJsonResponse(
                dockerNetworkSummaryListSchema,
                requestDockerEngine(socketPath, { path: await getVersionedPath('/networks') }),
            )
            return Promise.all(
                networks.map(async (network) =>
                    parseJsonResponse(
                        dockerNetworkSummarySchema,
                        requestDockerEngine(socketPath, {
                            path: await getVersionedPath(`/networks/${encodeURIComponent(network.Id)}`),
                        }),
                    ),
                ),
            )
        },
        getVolumes: async () =>
            parseJsonResponse(dockerVolumeSummaryListSchema, requestDockerEngine(socketPath, { path: await getVersionedPath('/volumes') })).then(
                (result) => result.Volumes,
            ),
        getInfo: async () => parseJsonResponse(dockerInfoSchema, requestDockerEngine(socketPath, { path: await getVersionedPath('/info') })),
        getVersion,
        loadImageArchive: async (filePath: string) => {
            const response = await requestDockerEngineFile(socketPath, await getVersionedPath('/images/load?quiet=1'), filePath)
            if (response.truncated) {
                throw createAppError('Docker image load 응답이 허용 크기를 초과했습니다.')
            }

            const messages = response.body
                .toString('utf8')
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) => dockerImageLoadMessageSchema.parse(JSON.parse(line)))
            const engineError = messages.find((message) => message.error)?.error
            if (engineError) {
                throw createAppError(`Docker image load 실패: ${engineError}`)
            }

            return messages.flatMap((message) => (message.stream ? [message.stream.trim()] : [])).filter((message) => message.length > 0)
        },
        performContainerAction: async (containerId: string, action: ContainerAction) => {
            const id = encodeURIComponent(containerId)
            let requestOptions: DockerRequestOptions

            if (action.action === 'remove') {
                requestOptions = {
                    expectedStatuses: [204],
                    method: 'DELETE',
                    path: await getVersionedPath(`/containers/${id}?force=${action.force ? '1' : '0'}&v=${action.removeVolumes ? '1' : '0'}`),
                }
            } else if (action.action === 'kill') {
                requestOptions = {
                    expectedStatuses: [204],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${id}/kill?signal=${encodeURIComponent(action.signal)}`),
                }
            } else if (action.action === 'update') {
                requestOptions = {
                    body: JSON.stringify({
                        Memory: action.memoryBytes,
                        MemorySwap: action.memoryBytes * DOCKER_MEMORY_SWAP_MULTIPLIER,
                        NanoCpus: action.nanoCpus,
                        PidsLimit: action.pidsLimit,
                    }),
                    expectedStatuses: [200],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${id}/update`),
                }
            } else if (action.action === 'rename') {
                requestOptions = {
                    expectedStatuses: [204],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${id}/rename?name=${encodeURIComponent(action.name)}`),
                }
            } else {
                const timeout = 'timeoutSeconds' in action ? `?t=${action.timeoutSeconds}` : ''
                requestOptions = {
                    expectedStatuses: [204, 304],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${id}/${action.action}${timeout}`),
                    timeoutMs:
                        action.action === 'stop' || action.action === 'restart'
                            ? action.timeoutSeconds * 1_000 + DOCKER_REQUEST_TIMEOUT_MS
                            : DOCKER_REQUEST_TIMEOUT_MS,
                }
            }

            await requestDockerEngine(socketPath, requestOptions)
        },
        pruneBuildCache: async (ids: string[]) => {
            const filters = encodeURIComponent(JSON.stringify({ id: ids }))
            const result = await parseJsonResponse(
                dockerBuildCachePruneResultSchema,
                requestDockerEngine(socketPath, {
                    method: 'POST',
                    path: await getVersionedPath(`/build/prune?filters=${filters}`),
                }),
            )
            return { deletedIds: result.CachesDeleted, spaceReclaimed: result.SpaceReclaimed }
        },
        removeImage: async (imageId: string, force: boolean, pruneChildren: boolean) =>
            parseJsonResponse(
                z.array(z.record(z.string(), z.string())),
                requestDockerEngine(socketPath, {
                    expectedStatuses: [200],
                    method: 'DELETE',
                    path: await getVersionedPath(
                        `/images/${encodeURIComponent(imageId)}?force=${force ? '1' : '0'}&noprune=${pruneChildren ? '0' : '1'}`,
                    ),
                }),
            ),
        removeNetwork: async (networkId: string) => {
            await requestDockerEngine(socketPath, {
                expectedStatuses: [204],
                method: 'DELETE',
                path: await getVersionedPath(`/networks/${encodeURIComponent(networkId)}`),
            })
        },
        removeVolume: async (volumeName: string, force: boolean) => {
            await requestDockerEngine(socketPath, {
                expectedStatuses: [204],
                method: 'DELETE',
                path: await getVersionedPath(`/volumes/${encodeURIComponent(volumeName)}?force=${force ? '1' : '0'}`),
            })
        },
        waitContainer: async (containerId: string, timeoutMs: number) => {
            const result = await parseJsonResponse(
                z.object({ StatusCode: z.number().int() }),
                requestDockerEngine(socketPath, {
                    expectedStatuses: [200],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/wait?condition=not-running`),
                    timeoutMs,
                }),
            )
            return { exitCode: result.StatusCode }
        },
        topContainer: async (containerId: string) => {
            const result = await parseJsonResponse(
                z.object({ Processes: z.array(z.array(z.string())).nullable(), Titles: z.array(z.string()) }),
                requestDockerEngine(socketPath, { path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/top`) }),
            )
            return { processes: result.Processes ?? [], titles: result.Titles }
        },
        changesContainer: async (containerId: string) => {
            const result = await parseJsonResponse(
                z.array(z.object({ Kind: z.number().int().min(0).max(2), Path: z.string() })).nullable(),
                requestDockerEngine(socketPath, { path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/changes`) }),
            )
            const kindNames = ['modified', 'added', 'deleted'] as const
            return (result ?? []).map((change) => ({ kind: kindNames[change.Kind] ?? 'modified', path: change.Path }))
        },
        pullImage: async (reference: string, registryAuth?: string) => {
            const separatorIndex = reference.includes('@') ? reference.indexOf('@') : reference.lastIndexOf(':')
            const hasTag = separatorIndex > reference.lastIndexOf('/')
            const fromImage = hasTag ? reference.slice(0, separatorIndex) : reference
            const tag = hasTag ? reference.slice(separatorIndex + 1) : 'latest'
            const response = await requestDockerEngine(socketPath, {
                expectedStatuses: [200],
                ...(registryAuth === undefined ? {} : { headers: { 'x-registry-auth': registryAuth } }),
                method: 'POST',
                path: await getVersionedPath(`/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`),
                timeoutMs: DOCKER_IMAGE_PULL_INACTIVITY_TIMEOUT_MS,
            })
            const messages = response.body
                .toString('utf8')
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .flatMap((line) => {
                    try {
                        return [z.object({ error: z.string().optional(), status: z.string().optional() }).parse(JSON.parse(line))]
                    } catch {
                        return []
                    }
                })
            const pullError = messages.find((message) => message.error)?.error
            if (pullError) {
                throw createAppError(`IMAGE_PULL_FAILED: ${pullError}`)
            }
            return {
                messages: messages.flatMap((message) => (message.status ? [message.status] : [])).slice(-DOCKER_PULL_MESSAGE_LIMIT),
                reference,
            }
        },
        tagImage: async (imageId: string, repository: string, tag: string) => {
            await requestDockerEngine(socketPath, {
                expectedStatuses: [201],
                method: 'POST',
                path: await getVersionedPath(
                    `/images/${encodeURIComponent(imageId)}/tag?repo=${encodeURIComponent(repository)}&tag=${encodeURIComponent(tag)}`,
                ),
            })
        },
        signalContainer: async (containerId: string, signal: string) => {
            await requestDockerEngine(socketPath, {
                expectedStatuses: [204],
                method: 'POST',
                path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/kill?signal=${encodeURIComponent(signal)}`),
            })
        },
        executeContainer: async (containerId: string, input: ContainerExecRequest) => {
            const createResponse = await parseJsonResponse(
                dockerExecCreateSchema,
                requestDockerEngine(socketPath, {
                    body: JSON.stringify({
                        AttachStderr: true,
                        AttachStdout: true,
                        Cmd: input.command,
                        Env: input.environment,
                        Tty: false,
                        User: input.user,
                        WorkingDir: input.workingDirectory,
                    }),
                    expectedStatuses: [201],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/exec`),
                }),
            )
            const outputResponse = await requestDockerEngine(socketPath, {
                body: JSON.stringify({ Detach: false, Tty: false }),
                expectedStatuses: [200],
                maxStoredBytes: input.maxOutputBytes,
                method: 'POST',
                path: await getVersionedPath(`/exec/${encodeURIComponent(createResponse.Id)}/start`),
                timeoutMs: input.timeoutMs,
            })
            const inspect = await parseJsonResponse(
                dockerExecInspectSchema,
                requestDockerEngine(socketPath, { path: await getVersionedPath(`/exec/${encodeURIComponent(createResponse.Id)}/json`) }),
            )

            return { ...parseMultiplexedOutput(outputResponse.body), exitCode: inspect.ExitCode, truncated: outputResponse.truncated }
        },
        createInteractiveExec: async (containerId: string, input: InteractiveExecTicketRequest) => {
            const created = await parseJsonResponse(
                dockerExecCreateSchema,
                requestDockerEngine(socketPath, {
                    body: JSON.stringify({
                        AttachStderr: true,
                        AttachStdin: true,
                        AttachStdout: true,
                        Cmd: input.command,
                        Env: input.environment,
                        Tty: true,
                        User: input.user,
                        WorkingDir: input.workingDirectory,
                    }),
                    expectedStatuses: [201],
                    method: 'POST',
                    path: await getVersionedPath(`/containers/${encodeURIComponent(containerId)}/exec`),
                }),
            )
            const socket = await requestDockerEngineUpgrade(
                socketPath,
                await getVersionedPath(`/exec/${encodeURIComponent(created.Id)}/start`),
                JSON.stringify({ Detach: false, Tty: true }),
            )
            void requestDockerEngine(socketPath, {
                expectedStatuses: [200, 201],
                method: 'POST',
                path: await getVersionedPath(`/exec/${encodeURIComponent(created.Id)}/resize?h=${input.rows}&w=${input.columns}`),
            }).catch(() => undefined)
            return { execId: created.Id, socket }
        },
        resizeInteractiveExec: async (execId: string, rows: number, columns: number) => {
            await requestDockerEngine(socketPath, {
                expectedStatuses: [200, 201],
                method: 'POST',
                path: await getVersionedPath(`/exec/${encodeURIComponent(execId)}/resize?h=${rows}&w=${columns}`),
            })
        },
        inspectInteractiveExec: async (execId: string) => {
            const inspected = await parseJsonResponse(
                dockerExecInspectSchema,
                requestDockerEngine(socketPath, { path: await getVersionedPath(`/exec/${encodeURIComponent(execId)}/json`) }),
            )
            return inspected.ExitCode
        },
    }
}

export type DockerEngineClient = ReturnType<typeof createDockerEngineClient>
