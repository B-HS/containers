import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createControlDatabase } from '@containers/db-schema/database'
import { operationJob, user } from '@containers/db-schema/schema'
import { buildControlPlaneStatusServiceDb } from '../../../compose/compose-control-plane'
import { createControlPlaneStatusService } from './create-control-plane-status-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-control-plane-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const timestamp = new Date('2026-08-01T00:00:00.000Z')
    const service = createControlPlaneStatusService({
        backupService: { list: async () => [] },
        db: buildControlPlaneStatusServiceDb(database.db, database.sqlite),
        maintenanceService: { getStatus: () => ({ enabled: false, reason: null, startedAt: null }) },
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    return { ...database, service, timestamp }
}

const createMigrationFolder = async (entries: Array<{ sql: string; tag: string; when: number }>) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-control-plane-migrations-'))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, 'meta'))
    for (const entry of entries) {
        await writeFile(join(directory, `${entry.tag}.sql`), entry.sql)
    }
    await writeFile(
        join(directory, 'meta', '_journal.json'),
        JSON.stringify({
            dialect: 'sqlite',
            entries: entries.map((entry, idx) => ({
                breakpoints: true,
                idx,
                tag: entry.tag,
                version: '7',
                when: entry.when,
            })),
            version: '7',
        }),
    )
    return directory
}

describe('control plane status service', () => {
    test('실제 migration 파일 sha256과 journal 기준으로 applied/pending을 판정하고 버전을 노출합니다', async () => {
        const { service, sqlite } = await createTestContext()

        const status = await service.getStatus()

        expect(status.version).toBe('0.1.0')
        expect(status.migrations.applied.length).toBeGreaterThan(0)
        expect(status.migrations.pending).toEqual([])
        expect(status.migrations.applied.every((migration) => migration.appliedAt !== null)).toBe(true)
        expect(status.databaseIntegrity.control).toBe('ok')
        expect(status.maintenance).toEqual({ enabled: false, reason: null, startedAt: null })
        expect(status.activeJobCount).toBe(0)
        expect(status.lastBackupAt).toBeNull()
        sqlite.close()
    })

    test('파일 내용 sha256 기준으로 미적용 migration을 pending으로 보고합니다', async () => {
        const { db, sqlite } = await createTestContext()
        const firstSql = 'CREATE TABLE probe_one (id text primary key);'
        const secondSql = 'CREATE TABLE probe_two (id text primary key);'
        const firstWhen = 1_800_000_000_000
        const migrationsFolder = await createMigrationFolder([
            { sql: secondSql, tag: '9001_probe_two', when: firstWhen + 1 },
            { sql: firstSql, tag: '9000_probe_one', when: firstWhen },
        ])
        const firstHash = createHash('sha256').update(firstSql).digest('hex')
        sqlite.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(firstHash, firstWhen)
        const statusService = createControlPlaneStatusService({
            backupService: { list: async () => [] },
            db: buildControlPlaneStatusServiceDb(db, sqlite),
            maintenanceService: { getStatus: () => ({ enabled: false, reason: null, startedAt: null }) },
            migrationsFolder,
        })

        const status = await statusService.getStatus()

        expect(status.migrations.applied).toEqual([{ appliedAt: new Date(firstWhen).toISOString(), tag: '9000_probe_one' }])
        expect(status.migrations.pending).toEqual([{ appliedAt: null, tag: '9001_probe_two' }])
        sqlite.close()
    })

    test('active job과 최신 backup 시각을 반영합니다', async () => {
        const { db, sqlite, timestamp } = await createTestContext()
        await db.insert(user).values({
            createdAt: timestamp,
            email: 'owner@example.com',
            emailVerified: true,
            id: 'control-plane-owner',
            name: 'Owner',
            updatedAt: timestamp,
        })
        await db.insert(operationJob).values({
            attempt: 0,
            createdAt: timestamp,
            id: 'queued-job',
            kind: 'backup.create',
            maxAttempts: 3,
            payload: '{}',
            scheduledAt: timestamp,
            status: 'queued',
            updatedAt: timestamp,
        })
        const statusService = createControlPlaneStatusService({
            backupService: {
                list: async () => [
                    {
                        controlBytes: 0,
                        controlSha256: 'a'.repeat(64),
                        createdAt: '2026-08-01T00:00:00.000Z',
                        id: 'backup-id',
                        label: null,
                        nginxBytes: null,
                        nginxSha256: null,
                        schemaVersion: 2 as const,
                        secretsBytes: null,
                        secretsIncluded: false,
                        secretsSha256: null,
                        trafficBytes: 0,
                        trafficSha256: 'a'.repeat(64),
                    },
                ],
            },
            db: buildControlPlaneStatusServiceDb(db, sqlite),
            maintenanceService: { getStatus: () => ({ enabled: false, reason: null, startedAt: null }) },
            migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
        })

        const status = await statusService.getStatus()

        expect(status.activeJobCount).toBe(1)
        expect(status.lastBackupAt).toBe('2026-08-01T00:00:00.000Z')
        sqlite.close()
    })
})
