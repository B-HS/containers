import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { createControlDatabase } from './database'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe('Control DB', () => {
    test('빈 SQLite 파일에 모든 migration을 적용합니다', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'containers-db-'))
        temporaryDirectories.push(directory)
        const { db, sqlite } = createControlDatabase({
            filePath: join(directory, 'control.sqlite'),
            migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
        })
        const tables = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`).map((record) => record.name)

        expect(tables).toContain('user')
        expect(tables).toContain('session')
        expect(tables).toContain('invitation')
        expect(tables).toContain('audit_log')
        expect(tables).toContain('api_key')
        expect(tables).toContain('artifact')
        expect(tables).toContain('upload_session')
        expect(tables).toContain('deployment')
        sqlite.close()
    })
})
