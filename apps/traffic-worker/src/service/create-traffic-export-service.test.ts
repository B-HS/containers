import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createTrafficDatabase } from '../db/database'
import { createTrafficExportService } from './create-traffic-export-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const event = {
    bytes_sent: 512,
    cf_ray: '',
    client_ip: '10.20.30.40',
    country: 'KR',
    host: '=formula.example',
    method: 'GET',
    protocol: 'HTTP/1.1',
    request_id: 'request-export',
    request_length: 100,
    request_time: 0.125,
    schema_version: 1 as const,
    scheme: 'http',
    server_name: 'panel.containers.local',
    status: 200,
    timestamp: '2026-08-01T01:00:00.000Z',
    upstream_addr: 'web:3000',
    upstream_connect_time: '0.001',
    upstream_header_time: '0.100',
    upstream_response_time: '0.125',
    upstream_status: '200',
    uri_path: '/ko',
    user_agent: 'secret-user-agent',
}

describe('traffic export', () => {
    test('시간 범위의 행을 마스킹하고 CSV injection을 무력화하며 오래된 파일을 정리합니다', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'containers-traffic-export-'))
        temporaryDirectories.push(directory)
        const exportRoot = join(directory, 'exports')
        await Bun.write(join(exportRoot, '.keep'), '')
        const expiredName = 'traffic-11111111-1111-4111-8111-111111111111.csv'
        await writeFile(join(exportRoot, expiredName), 'expired')
        const old = new Date('2026-07-01T00:00:00.000Z')
        await utimes(join(exportRoot, expiredName), old, old)
        const database = createTrafficDatabase({
            filePath: join(directory, 'traffic.sqlite'),
            migrationsFolder: resolve(import.meta.dir, '../../drizzle'),
        })
        database.insertEvents([event])
        const service = createTrafficExportService({
            database,
            exportRoot,
            now: () => new Date('2026-08-01T02:00:00.000Z').getTime(),
        })
        const jobId = '22222222-2222-4222-8222-222222222222'

        const result = await service.create(jobId, {
            format: 'csv',
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-01T02:00:00.000Z',
        })
        const content = await readFile(join(exportRoot, result.fileName), 'utf8')

        expect(result.rowCount).toBe(1)
        expect(content).toContain("'=formula.example")
        expect(content).toContain('10.20.30.0')
        expect(content).not.toContain('10.20.30.40')
        expect(content).not.toContain('secret-user-agent')
        await expect(stat(join(exportRoot, expiredName))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(
            service.create(jobId, {
                format: 'ndjson',
                from: '2026-07-30T00:00:00.000Z',
                to: '2026-08-01T02:00:00.000Z',
            }),
        ).rejects.toThrow()
        database.close()
    })
})
