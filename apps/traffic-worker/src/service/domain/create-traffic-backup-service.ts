import { createHash } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { backupIdSchema, backupSnapshotResultSchema } from '@containers/contracts/backup'
import type { TrafficDatabase } from '../../db/database'
import { createAppError } from '@/lib/error'

type TrafficBackupServiceDependencies = {
    backupRoot: string
    database: Pick<TrafficDatabase, 'restoreSnapshot' | 'serializeSnapshot'>
}

export const createTrafficBackupService = ({ backupRoot, database }: TrafficBackupServiceDependencies) => {
    const snapshotPath = (input: unknown) => join(backupRoot, backupIdSchema.parse(input), 'traffic.sqlite')

    return {
        create: async (input: unknown) => {
            const id = backupIdSchema.parse(input)
            const directory = join(backupRoot, id)
            const destination = snapshotPath(id)
            const temporary = `${destination}.tmp`
            await mkdir(directory, { recursive: true })
            const snapshot = database.serializeSnapshot()
            await Bun.write(temporary, snapshot)
            await rename(temporary, destination)
            return backupSnapshotResultSchema.parse({
                bytes: snapshot.byteLength,
                sha256: createHash('sha256').update(snapshot).digest('hex'),
            })
        },
        restore: async (input: unknown) => {
            const destination = snapshotPath(input)
            const file = Bun.file(destination)
            if (!(await file.exists())) {
                throw createAppError('BACKUP_TRAFFIC_NOT_FOUND')
            }
            const snapshot = new Uint8Array(await file.arrayBuffer())
            database.restoreSnapshot(destination)
            return backupSnapshotResultSchema.parse({
                bytes: snapshot.byteLength,
                sha256: createHash('sha256').update(snapshot).digest('hex'),
            })
        },
    }
}

export type TrafficBackupService = ReturnType<typeof createTrafficBackupService>
