import { Hono } from 'hono'
import { z } from 'zod'
import { describeRoute, validator } from 'hono-openapi'
import { trafficBackupParamSchema } from '@containers/contracts/backup'
import type { TrafficBackupService } from '../service/create-traffic-backup-service'
import { withErrorHandling } from '../lib/with-error-handling'

type BackupRouteDependencies = {
    backupService: TrafficBackupService
}

export const createBackupRoute = ({ backupService }: BackupRouteDependencies) =>
    new Hono()
        .post(
            '/:id',
            describeRoute({ summary: '트래픽 백업 생성', tags: ['backup'], responses: { 201: { description: '백업 결과' } } }),
            validator('param', trafficBackupParamSchema),
            withErrorHandling(async (context) => {
                const { id } = context.req.valid('param' as never) as z.infer<typeof trafficBackupParamSchema>
                return context.json(await backupService.create(id), 201)
            }),
        )
        .post(
            '/:id/restore',
            describeRoute({ summary: '트래픽 백업 복원', tags: ['backup'], responses: { 200: { description: '복원 결과' } } }),
            validator('param', trafficBackupParamSchema),
            withErrorHandling(async (context) => {
                const { id } = context.req.valid('param' as never) as z.infer<typeof trafficBackupParamSchema>
                return context.json(await backupService.restore(id), 200)
            }),
        )
