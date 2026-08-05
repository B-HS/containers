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

    try {
        sqlite.exec('PRAGMA foreign_keys = OFF')
        migrate(db, { migrationsFolder })
        sqlite.exec('PRAGMA foreign_keys = ON')
        const violations = sqlite.query('PRAGMA foreign_key_check').all() as Array<{ parent: string; table: string }>
        if (violations.length > 0) {
            const byTable = violations.reduce<Record<string, number>>(
                (counted, violation) => ({
                    ...counted,
                    [`${violation.table}→${violation.parent}`]: (counted[`${violation.table}→${violation.parent}`] ?? 0) + 1,
                }),
                {},
            )
            console.error(JSON.stringify({ byTable, event: 'control-database.foreign-key.violation', filePath, total: violations.length }))
        }
    } catch (error) {
        sqlite.exec('PRAGMA foreign_keys = ON')
        console.error(
            JSON.stringify({
                event: 'control-database.migrate.failed',
                filePath,
                message: error instanceof Error ? error.message : String(error),
                migrationsFolder,
            }),
        )
        throw error
    }

    return { db, sqlite }
}

export type ControlDatabase = ReturnType<typeof createControlDatabase>['db']
