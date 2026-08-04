import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createControlDatabase } from '@containers/db-schema/database'
import { user } from '@containers/db-schema/schema'
import { buildBackupServiceDb } from '../../../compose/compose-backup'
import { createBackupService } from './create-backup-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (retentionCount = 7) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-backup-'))
    temporaryDirectories.push(directory)
    const backupRoot = join(directory, 'backups')
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    let clock = Date.parse('2026-08-01T00:00:00.000Z')
    const createTrafficSnapshot = async (input: unknown) => {
        const id = String(input)
        await mkdir(join(backupRoot, id), { recursive: true })
        const source = new Database(':memory:', { strict: true })
        source.exec('CREATE TABLE access_event (id TEXT PRIMARY KEY) STRICT')
        const snapshot = source.serialize()
        source.close()
        await Bun.write(join(backupRoot, id, 'traffic.sqlite'), snapshot)
        return { bytes: snapshot.byteLength, sha256: createHash('sha256').update(snapshot).digest('hex') }
    }
    const service = createBackupService({
        backupRoot,
        db: buildBackupServiceDb({ sqlite: database.sqlite }),
        now: () => new Date(clock++),
        retentionCount,
        trafficWorkerClient: {
            createBackup: createTrafficSnapshot,
            restoreBackup: async (id) => {
                const snapshot = new Uint8Array(await Bun.file(join(backupRoot, String(id), 'traffic.sqlite')).arrayBuffer())
                return { bytes: snapshot.byteLength, sha256: createHash('sha256').update(snapshot).digest('hex') }
            },
        },
    })
    return { database, service }
}

const createUser = (id: string) => ({
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name: id,
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
})

describe('Control·Traffic backup orchestration', () => {
    test('두 DB manifest를 만들고 control DB를 선택한 시점으로 복구합니다', async () => {
        const { database, service } = await createTestContext()
        await database.db.insert(user).values(createUser('before-backup'))
        const backup = await service.create({ label: 'before-change' })
        await database.db.insert(user).values(createUser('after-backup'))
        expect(await database.db.select().from(user)).toHaveLength(2)

        const restored = await service.restore(backup.id, { confirmation: backup.id })
        const users = await database.db.select().from(user)
        expect(restored.restored).toBe(true)
        expect(restored.recoveryBackupId).not.toBe(backup.id)
        expect(users.map((record) => record.id).sort()).toEqual(['after-backup', 'before-backup'])
        database.sqlite.close()
    })

    test('retention 수를 넘긴 오래된 set을 제거하고 확인 문구 없는 삭제를 거부합니다', async () => {
        const { database, service } = await createTestContext(2)
        const first = await service.create({ label: 'first' })
        await service.create({ label: 'second' })
        const third = await service.create({ label: 'third' })

        expect((await service.list()).map((backup) => backup.id)).toEqual([third.id, expect.any(String)])
        expect(service.remove(third.id, { confirmation: first.id })).rejects.toThrow('CONFIRMATION_MISMATCH')
        expect(await service.remove(third.id, { confirmation: third.id })).toEqual({ removed: true })
        database.sqlite.close()
    })

    test('foreign key가 깨진 live DB는 snapshot을 만들지 않습니다', async () => {
        const { database, service } = await createTestContext()
        database.sqlite.exec('PRAGMA foreign_keys = OFF')
        database.sqlite.exec(
            "INSERT INTO audit_log (id, actor_id, auth_method, operation, target_type, request_id, result, created_at) VALUES ('orphan-audit', 'missing-user', 'session', 'test', 'user', 'request', 'success', 0)",
        )
        database.sqlite.exec('PRAGMA foreign_keys = ON')

        expect(service.create({ label: 'invalid' })).rejects.toThrow('BACKUP_CONTROL_FOREIGN_KEY_INVALID')
        database.sqlite.close()
    })

    test('digest가 손상된 backup도 UUID 확인 후 안전하게 삭제할 수 있습니다', async () => {
        const { database, service } = await createTestContext()
        const backup = await service.create({ label: 'corrupt' })
        await Bun.write(join(temporaryDirectories.at(-1) ?? '', 'backups', backup.id, 'control.sqlite'), 'invalid')

        expect(await service.remove(backup.id, { confirmation: backup.id })).toEqual({ removed: true })
        expect(await service.list()).toEqual([])
        database.sqlite.close()
    })
})
