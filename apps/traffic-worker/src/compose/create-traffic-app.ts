import { Hono } from 'hono'
import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'
import { createInternalAuthMiddleware } from '../middleware/create-internal-auth-middleware'
import { createTrafficRoute } from '../route/create-traffic-route'
import { createBackupRoute } from '../route/create-backup-route'
import type { TrafficBackupService } from '../service/create-traffic-backup-service'
import type { TrafficIngestionService } from '../service/create-traffic-ingestion-service'
import type { TrafficQueryService } from '../service/create-traffic-query-service'
import type { TrafficExportService } from '../service/create-traffic-export-service'

type TrafficAppDependencies = {
    backupService: TrafficBackupService
    exportService: TrafficExportService
    ingestionService: Pick<TrafficIngestionService, 'getState' | 'subscribe'>
    now: () => Date
    queryService: TrafficQueryService
    sharedSecret: string
}

export const createTrafficApp = ({ backupService, exportService, ingestionService, now, queryService, sharedSecret }: TrafficAppDependencies) => {
    const backupRoute = createBackupRoute({ backupService })
    const trafficRoute = createTrafficRoute({ exportService, ingestionService, queryService })

    return new Hono()
        .get('/health', (context) =>
            context.json(
                healthSchema.parse({
                    service: 'traffic-worker',
                    status: SERVICE_STATUS.OK,
                    timestamp: now().toISOString(),
                    version: '0.1.0',
                }),
                200,
            ),
        )
        .use('/v1/*', createInternalAuthMiddleware({ now: Date.now, secret: sharedSecret }))
        .route('/v1/backups', backupRoute)
        .route('/v1/traffic', trafficRoute)
}
