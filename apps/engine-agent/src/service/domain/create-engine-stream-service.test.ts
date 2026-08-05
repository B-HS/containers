import { describe, expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { SSE_STREAM_OPEN_COMMENT } from '@containers/contracts/engine-stream'
import { createAppError } from '../../lib/error'
import { createEngineStreamService, normalizeContainerStats, normalizeEngineEvent } from './create-engine-stream-service'

const NOW = new Date('2026-08-01T00:00:00.000Z')

const frame = (streamType: number, payload: string) => {
    const body = Buffer.from(payload, 'utf8')
    const header = Buffer.alloc(8)
    header[0] = streamType
    header.writeUInt32BE(body.byteLength, 4)
    return Buffer.concat([header, body])
}

const readUntil = async (reader: ReadableStreamDefaultReader<Uint8Array>, predicate: (text: string) => boolean) => {
    const decoder = new TextDecoder()
    let collected = ''
    while (!predicate(collected)) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }
        collected += decoder.decode(value, { stream: true })
    }
    return collected
}

describe('engine stream 정규화', () => {
    test('Docker event 를 name 외 attribute 없이 정규화합니다', () => {
        const line = JSON.stringify({
            Action: 'start',
            Actor: { Attributes: { image: 'nginx', name: 'edge', secretLabel: 'x' }, ID: 'abc' },
            scope: 'local',
            time: 1_785_542_400,
            Type: 'container',
        })

        expect(normalizeEngineEvent(line, NOW)).toEqual({
            action: 'start',
            actorId: 'abc',
            actorName: 'edge',
            kind: 'event',
            scope: 'local',
            time: new Date(1_785_542_400 * 1_000).toISOString(),
            type: 'container',
        })
        expect(normalizeEngineEvent('not-json', NOW)).toBeNull()
    })

    test('stats 를 공식 공식대로 계산하고 첫 sample 은 cpu 를 null 로 둡니다', () => {
        const sample = normalizeContainerStats(
            JSON.stringify({
                cpu_stats: { cpu_usage: { total_usage: 400 }, online_cpus: 2, system_cpu_usage: 2_000 },
                memory_stats: { limit: 1_000, stats: { inactive_file: 100 }, usage: 600 },
                networks: { eth0: { rx_bytes: 10, tx_bytes: 20 }, eth1: { rx_bytes: 5, tx_bytes: 5 } },
                pids_stats: { current: 7 },
                precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1_000 },
                read: '2026-08-01T00:00:01.123456789Z',
            }),
        )

        expect(sample).toEqual({
            cpuPercent: 40,
            kind: 'stats',
            memoryLimitBytes: 1_000,
            memoryPercent: 50,
            memoryUsedBytes: 500,
            networkRxBytes: 15,
            networkTxBytes: 25,
            pids: 7,
            readAt: '2026-08-01T00:00:01.123Z',
        })

        const firstSample = normalizeContainerStats(
            JSON.stringify({
                cpu_stats: { cpu_usage: { total_usage: 400 }, online_cpus: 2, system_cpu_usage: 2_000 },
                precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 0 },
            }),
        )
        expect(firstSample?.cpuPercent).toBeNull()
    })
})

describe('engine stream 서비스', () => {
    test('multiplex log 를 SSE data 로 방출하고 종료 시 stream 을 닫습니다', async () => {
        const source = new PassThrough()
        const service = createEngineStreamService({
            dockerEngineClient: {
                getContainers: async () => [],
                openContainerLogStream: async () => ({ stream: source, tty: false }),
                openContainerStatsStream: async () => new PassThrough(),
                openEventStream: async () => new PassThrough(),
            },
            now: () => NOW,
        })

        const stream = await service.openContainerLogStream('abc', 10, new AbortController().signal)
        expect(service.getActiveStreamCount()).toBe(1)
        const reader = stream.getReader()
        const opened = await reader.read()

        expect(new TextDecoder().decode(opened.value)).toBe(SSE_STREAM_OPEN_COMMENT)

        source.write(frame(1, 'hello'))
        const collected = await readUntil(reader, (text) => text.includes('\n\n'))

        expect(collected).toBe(`data: ${JSON.stringify({ kind: 'log', stream: 'stdout', text: 'hello', truncated: false })}\n\n`)

        source.end()
        const rest = await reader.read()
        expect(rest.done).toBe(true)
        expect(service.getActiveStreamCount()).toBe(0)
    })

    test('event stream 준비 실패 시 slot을 반납하고 source를 정리합니다', async () => {
        const source = new PassThrough()
        const service = createEngineStreamService({
            dockerEngineClient: {
                getContainers: async () => {
                    throw createAppError('CONTROL_FAILED')
                },
                openContainerLogStream: async () => ({ stream: new PassThrough(), tty: true }),
                openContainerStatsStream: async () => new PassThrough(),
                openEventStream: async () => source,
            },
            now: () => NOW,
        })

        await expect(service.openEventStream(new AbortController().signal)).rejects.toThrow('CONTROL_FAILED')
        expect(service.getActiveStreamCount()).toBe(0)
        expect(source.destroyed).toBe(true)
    })

    test('클라이언트가 끊으면 slot 을 반납하고 source 를 정리합니다', async () => {
        const source = new PassThrough()
        const service = createEngineStreamService({
            dockerEngineClient: {
                getContainers: async () => [],
                openContainerLogStream: async () => ({ stream: new PassThrough(), tty: true }),
                openContainerStatsStream: async () => new PassThrough(),
                openEventStream: async () => source,
            },
            now: () => NOW,
        })

        const controller = new AbortController()
        await service.openEventStream(controller.signal)

        expect(service.getActiveStreamCount()).toBe(1)

        controller.abort()

        expect(service.getActiveStreamCount()).toBe(0)
        expect(source.destroyed).toBe(true)
    })

    test('source 를 여는 동안 클라이언트가 끊으면 slot 이 새지 않습니다', async () => {
        const source = new PassThrough()
        const controller = new AbortController()
        let openStarted = false
        const service = createEngineStreamService({
            dockerEngineClient: {
                getContainers: async () => [],
                openContainerLogStream: async () => ({ stream: new PassThrough(), tty: true }),
                openContainerStatsStream: async () => new PassThrough(),
                openEventStream: async () => {
                    openStarted = true
                    controller.abort()
                    return source
                },
            },
            now: () => NOW,
        })

        await expect(service.openEventStream(controller.signal)).rejects.toThrow('STREAM_CLIENT_ABORTED')

        expect(openStarted).toBe(true)
        expect(service.getActiveStreamCount()).toBe(0)
        expect(source.destroyed).toBe(true)
    })

    test('동시 stream 상한을 넘으면 거부합니다', async () => {
        const service = createEngineStreamService({
            dockerEngineClient: {
                getContainers: async () => [],
                openContainerLogStream: async () => ({ stream: new PassThrough(), tty: true }),
                openContainerStatsStream: async () => new PassThrough(),
                openEventStream: async () => new PassThrough(),
            },
            now: () => NOW,
        })
        const streams = await Promise.all(Array.from({ length: 20 }, () => service.openEventStream(new AbortController().signal)))

        expect(service.getActiveStreamCount()).toBe(20)
        await expect(service.openEventStream(new AbortController().signal)).rejects.toThrow('ENGINE_STREAM_LIMIT')

        await Promise.all(streams.map((stream) => stream.cancel()))
        expect(service.getActiveStreamCount()).toBe(0)
    })
})
