import { afterEach, describe, expect, test } from 'bun:test'
import { appendFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrafficDatabase, type TrafficDatabase } from '../database/create-traffic-database'
import { createTrafficIngestionService } from './create-traffic-ingestion-service'
import { createTrafficQueryService } from './create-traffic-query-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createAccessEvent = (requestId: string, status = 200) => ({
    bytes_sent: 512,
    cf_ray: '',
    client_ip: '127.0.0.1',
    country: '',
    host: 'panel.containers.local',
    method: 'GET',
    protocol: 'HTTP/1.1',
    request_id: requestId,
    request_length: 100,
    request_time: 0.125,
    schema_version: 1,
    scheme: 'http',
    server_name: 'panel.containers.local',
    status,
    timestamp: '2026-07-31T00:00:00+00:00',
    upstream_addr: 'web:3000',
    upstream_connect_time: '0.001',
    upstream_header_time: '0.100',
    upstream_response_time: '0.125',
    upstream_status: status.toString(),
    uri_path: '/ko',
    user_agent: 'test',
})

const createFixture = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-traffic-'))
    temporaryDirectories.push(directory)
    const accessLogPath = join(directory, 'access.jsonl')
    const checkpointPath = join(directory, 'ingest-checkpoint.json')
    await writeFile(accessLogPath, '')
    const database = createTrafficDatabase({ filePath: join(directory, 'traffic.sqlite') })
    const now = new Date('2026-07-31T00:00:30.000Z').getTime()
    const createIngestion = (databaseOverride: Pick<TrafficDatabase, 'deleteBefore' | 'insertEvents'> = database) =>
        createTrafficIngestionService({
            accessLogPath,
            checkpointPath,
            database: databaseOverride,
            now: () => now,
            retentionMs: 14 * 24 * 60 * 60 * 1_000,
        })
    return { accessLogPath, checkpointPath, createIngestion, database, directory, now }
}

describe('트래픽 수집', () => {
    test('Nginx JSONL을 검증해 SQLite 집계로 반영합니다', async () => {
        const fixture = await createFixture()
        await writeFile(
            fixture.accessLogPath,
            `${JSON.stringify(createAccessEvent('request-1'))}\ninvalid-json\n${JSON.stringify(createAccessEvent('request-2', 503))}\n`,
        )
        const ingestion = fixture.createIngestion()

        await ingestion.poll()
        const queryService = createTrafficQueryService({ database: fixture.database, now: () => fixture.now })
        const summary = queryService.getSummary(1)
        const analytics = queryService.getAnalytics({ limit: 10, pathPrefix: '/ko', statusClass: 'all', windowMinutes: 1 })

        expect(ingestion.getState().ingestedEventCount).toBe(2)
        expect(ingestion.getState().invalidLineCount).toBe(1)
        expect(ingestion.getState().offset).toBeGreaterThan(0)
        expect(summary.requestCount).toBe(2)
        expect(summary.serverErrorCount).toBe(1)
        expect(summary.averageResponseTimeMs).toBe(125)
        expect(analytics.requestCount).toBe(2)
        expect(analytics.errorRate).toBe(0.5)
        expect(analytics.latency).toEqual({ p50Ms: 125, p95Ms: 125, p99Ms: 125 })
        expect(analytics.events[0]?.clientIpMasked).toBe('127.0.0.0')
        expect(JSON.stringify(analytics.events)).not.toContain('127.0.0.1')
        fixture.database.close()
    })

    test('부분 라인을 다음 poll까지 보류하고 재시작 후 중복 수집하지 않습니다', async () => {
        const fixture = await createFixture()
        const first = `${JSON.stringify(createAccessEvent('request-1'))}\n`
        const second = `${JSON.stringify(createAccessEvent('request-2'))}\n`
        const split = Math.floor(second.length / 2)
        await writeFile(fixture.accessLogPath, first + second.slice(0, split))
        const ingestion = fixture.createIngestion()

        await ingestion.poll()
        expect(fixture.database.getSummary(0)?.requestCount).toBe(1)
        await appendFile(fixture.accessLogPath, second.slice(split))
        await ingestion.poll()
        expect(fixture.database.getSummary(0)?.requestCount).toBe(2)

        const restarted = fixture.createIngestion()
        await restarted.poll()
        expect(fixture.database.getSummary(0)?.requestCount).toBe(2)
        expect(restarted.getState().duplicateLineCount).toBe(0)
        fixture.database.close()
    })

    test('rename 회전 뒤 이전 inode를 끝까지 비운 다음 새 로그를 수집합니다', async () => {
        const fixture = await createFixture()
        await writeFile(fixture.accessLogPath, `${JSON.stringify(createAccessEvent('request-1'))}\n`)
        const ingestion = fixture.createIngestion()
        await ingestion.poll()

        const rotatedPath = `${fixture.accessLogPath}.1`
        await rename(fixture.accessLogPath, rotatedPath)
        await appendFile(rotatedPath, `${JSON.stringify(createAccessEvent('request-2'))}\n`)
        await writeFile(fixture.accessLogPath, `${JSON.stringify(createAccessEvent('request-3'))}\n`)

        await ingestion.poll()
        await ingestion.poll()
        await ingestion.poll()
        expect(fixture.database.getSummary(0)?.requestCount).toBe(3)
        expect(ingestion.getState().duplicateLineCount).toBe(0)
        fixture.database.close()
    })

    test('DB 쓰기 실패 시 체크포인트를 전진시키지 않고 재시도합니다', async () => {
        const fixture = await createFixture()
        await writeFile(fixture.accessLogPath, `${JSON.stringify(createAccessEvent('request-1'))}\n`)
        let shouldFail = true
        const ingestion = fixture.createIngestion({
            deleteBefore: fixture.database.deleteBefore,
            insertEvents: (events) => {
                if (shouldFail) throw new Error('DB_WRITE_FAILED')
                return fixture.database.insertEvents(events)
            },
        })

        await expect(ingestion.poll()).rejects.toThrow('DB_WRITE_FAILED')
        await expect(readFile(fixture.checkpointPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
        shouldFail = false
        await ingestion.poll()

        expect(fixture.database.getSummary(0)?.requestCount).toBe(1)
        expect(ingestion.getState().offset).toBeGreaterThan(0)
        fixture.database.close()
    })

    test('DB에 새로 반영된 이벤트만 필터링하고 민감 필드를 제거해 구독자에게 전달합니다', async () => {
        const fixture = await createFixture()
        const event = createAccessEvent('request-live', 503)
        await writeFile(fixture.accessLogPath, `${JSON.stringify(event)}\n`)
        const ingestion = fixture.createIngestion()
        const received: unknown[] = []
        ingestion.subscribe({ pathPrefix: '/ko', statusClass: '5xx' }, (liveEvent) => received.push(liveEvent))

        await ingestion.poll()
        expect(received).toHaveLength(1)
        expect(received[0]).toMatchObject({ clientIpMasked: '127.0.0.0', requestId: 'request-live', status: 503 })
        expect(JSON.stringify(received)).not.toContain('127.0.0.1')
        expect(JSON.stringify(received)).not.toContain('user_agent')

        await rm(fixture.checkpointPath)
        const replay = fixture.createIngestion()
        replay.subscribe({ statusClass: 'all' }, (liveEvent) => received.push(liveEvent))
        await replay.poll()
        expect(received).toHaveLength(1)
        expect(replay.getState().duplicateLineCount).toBe(1)
        fixture.database.close()
    })
})
