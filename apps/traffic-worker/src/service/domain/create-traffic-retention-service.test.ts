import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createTrafficDatabase } from '../../db/database'
import { createTrafficRetentionService } from './create-traffic-retention-service'

const temporaryDirectories: string[] = []
const NOW = new Date('2026-08-05T00:00:00.000Z').getTime()
const DAY_MS = 24 * 60 * 60 * 1_000

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createEvent = (requestId: string, occurredAtMs: number) => ({
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
    schema_version: 1 as const,
    scheme: 'http',
    server_name: 'panel.containers.local',
    status: 200,
    timestamp: new Date(occurredAtMs).toISOString(),
    upstream_addr: 'web:3000',
    upstream_connect_time: '0.001',
    upstream_header_time: '0.100',
    upstream_response_time: '0.125',
    upstream_status: '200',
    uri_path: '/ko',
    user_agent: 'test',
})

const createFixture = async (options: { maxByteSize?: number; maxRowCount?: number } = {}) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-retention-'))
    temporaryDirectories.push(directory)
    const database = createTrafficDatabase({
        filePath: join(directory, 'traffic.sqlite'),
        migrationsFolder: resolve(import.meta.dir, '../../../drizzle'),
    })
    const service = createTrafficRetentionService({
        database,
        maxByteSize: options.maxByteSize ?? Number.MAX_SAFE_INTEGER,
        maxRowCount: options.maxRowCount ?? Number.MAX_SAFE_INTEGER,
        now: () => NOW,
        retentionMs: 14 * DAY_MS,
    })
    return { database, service }
}

describe('트래픽 보존 정리', () => {
    test('보존 기간이 지난 행을 삭제합니다', async () => {
        const { database, service } = await createFixture()
        database.insertEvents([createEvent('old', NOW - 30 * DAY_MS), createEvent('recent', NOW - DAY_MS)])

        expect(service.run().removedByAge).toBe(1)
        expect(database.getStorageStats().rowCount).toBe(1)
        database.close()
    })

    test('행수 상한을 넘으면 오래된 행부터 삭제합니다', async () => {
        const { database, service } = await createFixture({ maxRowCount: 2 })
        database.insertEvents([
            createEvent('first', NOW - 4_000),
            createEvent('second', NOW - 3_000),
            createEvent('third', NOW - 2_000),
            createEvent('fourth', NOW - 1_000),
        ])

        expect(service.run().removedByRowLimit).toBe(2)
        expect(database.getRecentEvents({ pathPrefix: '', since: 0, statusMaximum: 599, statusMinimum: 0 }, 10).map((row) => row.requestId)).toEqual([
            'fourth',
            'third',
        ])
        database.close()
    })

    test('바이트 상한에 여유가 있으면 삭제하지 않습니다', async () => {
        const { database, service } = await createFixture({ maxByteSize: 16 * 1_024 * 1_024 })
        database.insertEvents(Array.from({ length: 500 }, (_, index) => createEvent(`request-${index}`, NOW - (500 - index) * 1_000)))

        expect(database.getStorageStats().byteSize).toBeGreaterThan(0)
        expect(service.run().removedByByteLimit).toBe(0)
        expect(database.getStorageStats().rowCount).toBe(500)
        database.close()
    })

    test('바이트 상한을 넘으면 오래된 행을 비율만큼 삭제합니다', async () => {
        const { database, service } = await createFixture({ maxByteSize: 1 })
        database.insertEvents(Array.from({ length: 200 }, (_, index) => createEvent(`request-${index}`, NOW - (200 - index) * 1_000)))

        const result = service.run()
        expect(result.removedByByteLimit).toBeGreaterThan(0)
        expect(service.getState().removedByByteLimitCount).toBe(result.removedByByteLimit)
        expect(database.getStorageStats().rowCount).toBeLessThan(200)
        database.close()
    })

    test('회수 가능한 공간 비율이 높으면 VACUUM 을 수행합니다', async () => {
        const { database, service } = await createFixture({ maxRowCount: 10 })
        database.insertEvents(Array.from({ length: 4_000 }, (_, index) => createEvent(`request-${index}`, NOW - (4_000 - index) * 1_000)))

        const result = service.run()
        expect(result.removedByRowLimit).toBe(3_990)
        expect(result.vacuumed).toBe(true)
        expect(service.getState().vacuumCount).toBe(1)
        expect(database.getStorageStats().reclaimableByteSize).toBe(0)
        database.close()
    })
})
