import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { backupIdSchema, backupSnapshotResultSchema } from '@containers/contracts/backup'
import type { TrafficDatabase } from '../../db/database'
import { createAppError } from '@/lib/error'
import { hashFile } from '@/lib/hash-file'

type TrafficBackupServiceDependencies = {
    backupRoot: string
    database: Pick<TrafficDatabase, 'restoreSnapshot' | 'writeSnapshot'>
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
            await rm(temporary, { force: true })
            database.writeSnapshot(temporary)
            await rename(temporary, destination)
            return backupSnapshotResultSchema.parse(await hashFile(destination))
        },
        restore: async (input: unknown) => {
            const destination = snapshotPath(input)
            const file = Bun.file(destination)
            if (!(await file.exists())) {
                throw createAppError('BACKUP_TRAFFIC_NOT_FOUND')
            }
            const result = await hashFile(destination)
            database.restoreSnapshot(destination)
            return backupSnapshotResultSchema.parse(result)
        },
    }
}

export type TrafficBackupService = ReturnType<typeof createTrafficBackupService>
