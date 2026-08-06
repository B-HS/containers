import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { auditLog, user } from '@containers/db-schema/schema'
import { buildAuditServiceDb } from '../../../compose/compose-audit'
import { createAuditService } from './create-audit-service'

const temporaryDirectories: string[] = []
const NOW = new Date('2026-08-05T00:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1_000
const RETENTION_DAYS = 30

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (now: Date = NOW) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-audit-service-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    await database.db.insert(user).values({
        createdAt: NOW,
        email: 'owner@example.com',
        emailVerified: true,
        id: 'user-owner',
        name: 'Owner',
        updatedAt: NOW,
    })
    const archiveRoot = join(directory, 'audit-archives')
    const service = createAuditService({
        archiveRoot,
        db: buildAuditServiceDb(database.db),
        now: () => now,
        retentionDays: RETENTION_DAYS,
    })
    return { archiveRoot, database, service }
}

const createRecord = (id: string, createdAt: Date) => ({
    actorId: 'user-owner',
    authMethod: 'session',
    createdAt,
    detail: null,
    id,
    operation: 'container.start',
    requestId: `request-${id}`,
    result: 'success',
    sourceIp: '203.0.113.5',
    targetId: `container-${id}`,
    targetType: 'container',
})

describe('감사 로그 보존', () => {
    test('보존 기간이 지난 기록만 아카이브 파일로 옮기고 DB 에서 제거합니다', async () => {
        const { archiveRoot, database, service } = await createTestContext()
        await database.db
            .insert(auditLog)
            .values([
                createRecord('expired-1', new Date(NOW.getTime() - 400 * DAY_MS)),
                createRecord('expired-2', new Date(NOW.getTime() - 31 * DAY_MS)),
                createRecord('kept', new Date(NOW.getTime() - DAY_MS)),
            ])

        const archivedCount = await service.archiveExpired()
        const files = await readdir(archiveRoot)
        const lines = (await readFile(join(archiveRoot, files[0] ?? ''), 'utf8')).trim().split('\n')
        const page = await service.list({ limit: 50, offset: 0 })

        expect(archivedCount).toBe(2)
        expect(files).toHaveLength(1)
        expect(lines.map((line) => (JSON.parse(line) as { id: string }).id)).toEqual(['expired-1', 'expired-2'])
        expect(page.data.map((record) => record.targetId)).toEqual(['container-kept'])
        database.sqlite.close()
    })

    test('보존 대상이 없으면 아카이브 파일을 만들지 않습니다', async () => {
        const { archiveRoot, database, service } = await createTestContext()
        await database.db.insert(auditLog).values([createRecord('recent', new Date(NOW.getTime() - DAY_MS))])

        expect(await service.archiveExpired()).toBe(0)
        expect(await readdir(archiveRoot).catch(() => [])).toEqual([])
        database.sqlite.close()
    })

    test('같은 초에 쌓인 기록을 삽입 순서 역순으로 보여줍니다', async () => {
        const { database, service } = await createTestContext()
        const sameSecond = new Date(NOW.getTime() - DAY_MS)
        await database.db
            .insert(auditLog)
            .values([createRecord('first', sameSecond), createRecord('second', sameSecond), createRecord('third', sameSecond)])

        const page = await service.list({ limit: 50, offset: 0 })

        expect(page.data.map((record) => record.targetId)).toEqual(['container-third', 'container-second', 'container-first'])
        database.sqlite.close()
    })

    test('기록한 항목은 해시 체인으로 이어지고 무결성 검사를 통과한다', async () => {
        const { database, service } = await createTestContext(new Date('2026-08-05T00:00:00.750Z'))
        for (let index = 0; index < 3; index += 1) {
            await service.record({
                actorId: 'user-owner',
                operation: `nginx.route.create.${index}`,
                requestId: `request-${index}`,
                result: 'success',
                sourceIp: '203.0.113.10',
                targetId: `route-${index}`,
                targetType: 'nginx-route',
            })
        }

        const stored = await database.db.select().from(auditLog).orderBy(auditLog.sequence)
        expect(stored.map((row) => row.sequence)).toEqual([1, 2, 3])
        expect(stored.every((row) => row.entryHash !== null && row.previousHash !== null)).toBe(true)
        expect(await service.verifyIntegrity()).toEqual({ anchorSequence: 0, brokenAt: null, brokenEntry: null, checked: 3, unchained: 0 })
        database.sqlite.close()
    })

    test('기록을 고치면 무결성 검사가 그 지점을 짚는다', async () => {
        const { database, service } = await createTestContext()
        for (let index = 0; index < 3; index += 1) {
            await service.record({
                actorId: 'user-owner',
                operation: `nginx.route.create.${index}`,
                requestId: `request-${index}`,
                result: 'success',
                sourceIp: '203.0.113.10',
                targetId: `route-${index}`,
                targetType: 'nginx-route',
            })
        }
        await database.db.update(auditLog).set({ result: 'failure' }).where(eq(auditLog.sequence, 2))

        const verification = await service.verifyIntegrity()
        expect(verification.brokenAt).toBe(2)
        expect(verification.brokenEntry?.operation).toBe('nginx.route.create.1')
        database.sqlite.close()
    })

    test('기록을 지우면 무결성 검사가 다음 항목에서 끊김을 본다', async () => {
        const { database, service } = await createTestContext()
        for (let index = 0; index < 3; index += 1) {
            await service.record({
                actorId: 'user-owner',
                operation: `nginx.route.create.${index}`,
                requestId: `request-${index}`,
                result: 'success',
                sourceIp: '203.0.113.10',
                targetId: `route-${index}`,
                targetType: 'nginx-route',
            })
        }
        await database.db.delete(auditLog).where(eq(auditLog.sequence, 2))

        expect((await service.verifyIntegrity()).brokenAt).toBe(3)
        database.sqlite.close()
    })
})
