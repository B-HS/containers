import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BACKUP_RESTORE_MODE } from '@containers/contracts/backup'
import { createControlDatabase } from '@containers/db-schema/database'
import { artifact, deployment, user } from '@containers/db-schema/schema'
import { buildBackupServiceDb } from '../../../compose/compose-backup'
import { createBackupService } from './create-backup-service'

const PASSPHRASE = 'correct horse battery staple'
const DEPLOYMENT_KEY = 'deployment-master-key-0123456789abcdef'
const NOTIFICATION_KEY = 'notification-master-key-0123456789abcdef'
const NGINX_CONFIG = 'events {}\nhttp { server { listen 8080; } }\n'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (retentionCount = 7) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-backup-'))
    temporaryDirectories.push(directory)
    const backupRoot = join(directory, 'backups')
    const secretKeyFiles = { deployment: join(directory, 'deployment-secret-key'), notification: join(directory, 'notification-secret-key') }
    await writeFile(secretKeyFiles.deployment, DEPLOYMENT_KEY, 'utf8')
    await writeFile(secretKeyFiles.notification, NOTIFICATION_KEY, 'utf8')
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
        nginxConfigProvider: async () => NGINX_CONFIG,
        now: () => new Date(clock++),
        retentionCount,
        secretKeyFiles,
        trafficWorkerClient: {
            createBackup: createTrafficSnapshot,
            restoreBackup: async (id) => {
                const snapshot = new Uint8Array(await Bun.file(join(backupRoot, String(id), 'traffic.sqlite')).arrayBuffer())
                return { bytes: snapshot.byteLength, sha256: createHash('sha256').update(snapshot).digest('hex') }
            },
        },
    })
    return { backupRoot, database, secretKeyFiles, service }
}

const timestamp = new Date('2026-08-01T00:00:00.000Z')

const createUser = (id: string) => ({
    createdAt: timestamp,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name: id,
    updatedAt: timestamp,
})

const createArtifact = (id: string, createdBy: string) => ({
    createdAt: timestamp,
    createdBy,
    fileName: `${id}.tar`,
    id,
    mediaType: 'application/x-tar',
    sha256: createHash('sha256').update(id).digest('hex'),
    sizeBytes: 1,
    status: 'ready',
    storagePath: `/artifacts/${id}.tar`,
})

const createDeployment = (id: string, artifactId: string, createdBy: string) => ({
    artifactId,
    createdAt: timestamp,
    createdBy,
    id,
    status: 'loaded',
    updatedAt: timestamp,
})

const listUserIds = async (database: Awaited<ReturnType<typeof createTestContext>>['database']) =>
    (await database.db.select().from(user)).map((record) => record.id).sort()

describe('Control·Traffic backup orchestration', () => {
    test('두 DB manifest를 만들고 control DB를 선택한 시점으로 복구합니다', async () => {
        const { database, service } = await createTestContext()
        await database.db.insert(user).values(createUser('before-backup'))
        const backup = await service.create({ label: 'before-change' })
        await database.db.insert(user).values(createUser('after-backup'))

        const restored = await service.restore(backup.id, { confirmation: backup.id })

        expect(restored.restored).toBe(true)
        expect(restored.mode).toBe(BACKUP_RESTORE_MODE.PRESERVE_HOST)
        expect(restored.secretsRestored).toBe(false)
        expect(restored.recoveryBackupId).not.toBe(backup.id)
        expect(await listUserIds(database)).toEqual(['after-backup', 'before-backup'])
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
        const { backupRoot, database, service } = await createTestContext()
        const backup = await service.create({ label: 'corrupt' })
        await Bun.write(join(backupRoot, backup.id, 'control.sqlite'), 'invalid')

        expect(await service.remove(backup.id, { confirmation: backup.id })).toEqual({ removed: true })
        expect(await service.list()).toEqual([])
        database.sqlite.close()
    })
})

describe('Migration 상태 보호', () => {
    test('복구가 migration 기록을 백업 시점으로 되돌리지 않습니다', async () => {
        const { database, service } = await createTestContext()
        const backup = await service.create({ label: 'before-migration' })
        database.sqlite.exec("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('future-migration', 9999999999999)")
        const before = database.sqlite.query<{ total: number }, []>('SELECT COUNT(*) AS total FROM __drizzle_migrations').get()?.total

        await service.restore(backup.id, { confirmation: backup.id, mode: BACKUP_RESTORE_MODE.FULL })

        const after = database.sqlite.query<{ total: number }, []>('SELECT COUNT(*) AS total FROM __drizzle_migrations').get()?.total
        expect(after).toBe(before ?? 0)
        expect(database.sqlite.query<{ hash: string }, []>("SELECT hash FROM __drizzle_migrations WHERE hash = 'future-migration'").get()?.hash).toBe(
            'future-migration',
        )
        database.sqlite.close()
    })
})

describe('복구 모드', () => {
    test('preserve-host 는 운영자를 유지하고 배포 상태만 FK 무결성을 지키며 되돌립니다', async () => {
        const { database, service } = await createTestContext()
        await database.db.insert(user).values(createUser('owner'))
        await database.db.insert(artifact).values(createArtifact('artifact-1', 'owner'))
        await database.db.insert(deployment).values(createDeployment('deployment-1', 'artifact-1', 'owner'))
        const backup = await service.create({ label: 'with-deployment' })
        await database.db.delete(deployment)
        await database.db.delete(artifact)
        await database.db.insert(user).values(createUser('added-later'))

        const restored = await service.restore(backup.id, { confirmation: backup.id, mode: BACKUP_RESTORE_MODE.PRESERVE_HOST })

        expect(restored.mode).toBe(BACKUP_RESTORE_MODE.PRESERVE_HOST)
        expect((await database.db.select().from(artifact)).map((record) => record.id)).toEqual(['artifact-1'])
        expect((await database.db.select().from(deployment)).map((record) => record.id)).toEqual(['deployment-1'])
        expect(await listUserIds(database)).toEqual(['added-later', 'owner'])
        expect(database.sqlite.query('PRAGMA foreign_key_check').get()).toBeNull()
        database.sqlite.close()
    })

    test('full 은 운영자까지 교체하고 남은 job 의 dangling actor 를 NULL 로 정규화합니다', async () => {
        const { database, service } = await createTestContext()
        await database.db.insert(user).values(createUser('snapshot-owner'))
        const backup = await service.create({ label: 'disaster-recovery' })
        await database.db.insert(user).values(createUser('host-only-owner'))
        database.sqlite.exec(
            "INSERT INTO operation_job (id, kind, status, payload, attempt, max_attempts, created_by, scheduled_at, created_at, updated_at) VALUES ('job-1', 'backup.restore', 'running', '{}', 1, 1, 'host-only-owner', 0, 0, 0)",
        )

        const restored = await service.restore(backup.id, { confirmation: backup.id, mode: BACKUP_RESTORE_MODE.FULL })

        expect(restored.mode).toBe(BACKUP_RESTORE_MODE.FULL)
        expect(await listUserIds(database)).toEqual(['snapshot-owner'])
        expect(
            database.sqlite.query<{ created_by: string | null }, []>("SELECT created_by FROM operation_job WHERE id = 'job-1'").get()?.created_by,
        ).toBeNull()
        expect(database.sqlite.query('PRAGMA foreign_key_check').get()).toBeNull()
        database.sqlite.close()
    })
})

describe('암호화 마스터 키 백업', () => {
    test('passphrase 없이 만든 backup 은 키 미포함으로 표시하고 nginx 설정만 포함합니다', async () => {
        const { backupRoot, database, service } = await createTestContext()

        const backup = await service.create({ label: 'no-keys' })

        expect(backup.secretsIncluded).toBe(false)
        expect(backup.secretsSha256).toBeNull()
        expect(backup.nginxSha256).not.toBeNull()
        expect(await Bun.file(join(backupRoot, backup.id, 'nginx.conf')).text()).toBe(NGINX_CONFIG)
        expect(await Bun.file(join(backupRoot, backup.id, 'secrets.enc')).exists()).toBe(false)
        expect(service.restore(backup.id, { confirmation: backup.id, passphrase: PASSPHRASE })).rejects.toThrow('BACKUP_SECRET_NOT_INCLUDED')
        database.sqlite.close()
    })

    test('passphrase 로 봉인한 키를 복구 시 같은 passphrase 로만 되살립니다', async () => {
        const { backupRoot, database, secretKeyFiles, service } = await createTestContext()

        const backup = await service.create({ label: 'with-keys', passphrase: PASSPHRASE })

        expect(backup.secretsIncluded).toBe(true)
        expect(backup.secretsSha256).not.toBeNull()
        const envelope = await Bun.file(join(backupRoot, backup.id, 'secrets.enc')).text()
        expect(envelope).not.toContain(DEPLOYMENT_KEY)
        expect(envelope).not.toContain(NOTIFICATION_KEY)

        await writeFile(secretKeyFiles.deployment, 'replaced-deployment-key', 'utf8')
        await writeFile(secretKeyFiles.notification, 'replaced-notification-key', 'utf8')

        expect(service.restore(backup.id, { confirmation: backup.id, passphrase: 'wrong-passphrase-value' })).rejects.toThrow(
            'BACKUP_SECRET_PASSPHRASE_INVALID',
        )
        expect(await readFile(secretKeyFiles.deployment, 'utf8')).toBe('replaced-deployment-key')

        const restored = await service.restore(backup.id, { confirmation: backup.id, passphrase: PASSPHRASE })

        expect(restored.secretsRestored).toBe(true)
        expect(await readFile(secretKeyFiles.deployment, 'utf8')).toBe(DEPLOYMENT_KEY)
        expect(await readFile(secretKeyFiles.notification, 'utf8')).toBe(NOTIFICATION_KEY)
        database.sqlite.close()
    })

    test('route 가 미리 맡긴 passphrase 를 job 실행 시 소비합니다', async () => {
        const { database, secretKeyFiles, service } = await createTestContext()
        const backup = await service.create({ label: 'staged', passphrase: PASSPHRASE })
        await writeFile(secretKeyFiles.deployment, 'replaced-deployment-key', 'utf8')

        service.stageRestoreSecret(backup.id, PASSPHRASE)
        const restored = await service.restore(backup.id, { confirmation: backup.id })

        expect(restored.secretsRestored).toBe(true)
        expect(await readFile(secretKeyFiles.deployment, 'utf8')).toBe(DEPLOYMENT_KEY)
        database.sqlite.close()
    })
})
