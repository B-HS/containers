import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { schema } from './schema'

type ControlDatabaseOptions = {
    filePath: string
    migrationsFolder: string
}

export const createControlDatabase = ({ filePath, migrationsFolder }: ControlDatabaseOptions) => {
    const sqlite = new Database(filePath, { create: true, strict: true })

    sqlite.exec('PRAGMA journal_mode = WAL')
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec('PRAGMA busy_timeout = 5000')

    const db = drizzle({ client: sqlite, schema })
    migrate(db, { migrationsFolder })

    return { db, sqlite }
}

export type ControlDatabase = ReturnType<typeof createControlDatabase>['db']
