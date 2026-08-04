import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTrafficDatabase } from '../db/database'
import { createTrafficBackupService } from './create-traffic-backup-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createEvent = (requestId: string) => ({
    bytes_sent: 10,
    cf_ray: '',
    client_ip: '127.0.0.1',
    country: '',
    host: 'panel.containers.local',
    method: 'GET',
    protocol: 'HTTP/1.1',
    request_id: requestId,
    request_length: 10,
    request_time: 0.01,
    schema_version: 1 as const,
    scheme: 'http',
    server_name: 'panel.containers.local',
    status: 200,
    timestamp: '2026-07-31T00:00:00.000Z',
    upstream_addr: 'web:3000',
    upstream_connect_time: '0.001',
    upstream_header_time: '0.005',
    upstream_response_time: '0.01',
    upstream_status: '200',
    uri_path: '/ko',
    user_agent: 'test',
})

describe('Traffic SQLite backup', () => {
    test('일관 snapshot을 생성하고 변경된 DB를 원래 시점으로 복구합니다', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'containers-traffic-backup-'))
        temporaryDirectories.push(directory)
        const database = createTrafficDatabase({
            filePath: join(directory, 'traffic-live.sqlite'),
            migrationsFolder: resolve(import.meta.dir, '../../drizzle'),
        })
        const service = createTrafficBackupService({ backupRoot: join(directory, 'backups'), database })
        const id = randomUUID()

        database.insertEvents([createEvent('before-backup')])
        const snapshot = await service.create(id)
        database.insertEvents([createEvent('after-backup')])
        expect(database.getSummary(0)?.requestCount).toBe(2)

        const restored = await service.restore(id)
        expect(restored).toEqual(snapshot)
        expect(database.getSummary(0)?.requestCount).toBe(1)
        database.close()
    })

    test('유효한 SQLite가 아닌 snapshot은 복구하지 않습니다', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'containers-traffic-backup-'))
        temporaryDirectories.push(directory)
        const database = createTrafficDatabase({
            filePath: join(directory, 'traffic-live.sqlite'),
            migrationsFolder: resolve(import.meta.dir, '../../drizzle'),
        })
        const service = createTrafficBackupService({ backupRoot: join(directory, 'backups'), database })
        const id = randomUUID()
        await mkdir(join(directory, 'backups', id), { recursive: true })
        await Bun.write(join(directory, 'backups', id, 'traffic.sqlite'), 'invalid')

        expect(service.restore(id)).rejects.toThrow()
        database.close()
    })
})
