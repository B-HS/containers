import { Hono } from 'hono'
import type { TrafficBackupService } from '../service/create-traffic-backup-service'

type BackupRouteDependencies = {
    backupService: TrafficBackupService
}

export const createBackupRoute = ({ backupService }: BackupRouteDependencies) =>
    new Hono()
        .post('/:id', async (context) => {
            try {
                return context.json(await backupService.create(context.req.param('id')), 201)
            } catch (error) {
                const code = error instanceof Error ? error.message.split(':')[0] : 'BACKUP_TRAFFIC_CREATE_FAILED'
                return context.json({ error: { code } }, 422)
            }
        })
        .post('/:id/restore', async (context) => {
            try {
                return context.json(await backupService.restore(context.req.param('id')), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message.split(':')[0] : 'BACKUP_TRAFFIC_RESTORE_FAILED'
                return context.json({ error: { code } }, 422)
            }
        })
