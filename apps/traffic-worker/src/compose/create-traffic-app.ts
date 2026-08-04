import { Hono } from 'hono'
import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'
import { createInternalAuthMiddleware } from '../middleware/create-internal-auth-middleware'
import { createTrafficRoute } from '../route/create-traffic-route'
import { createBackupRoute } from '../route/create-backup-route'
import type { TrafficBackupService } from '../service/domain/create-traffic-backup-service'
import type { TrafficIngestionService } from '../service/domain/create-traffic-ingestion-service'
import type { TrafficQueryService } from '../service/domain/create-traffic-query-service'
import type { TrafficExportService } from '../service/domain/create-traffic-export-service'
import type { TrafficRetentionService } from '../service/domain/create-traffic-retention-service'
import { createTrafficSseStream } from '../service/shared/create-traffic-sse-stream'

type TrafficAppDependencies = {
    backupService: TrafficBackupService
    exportService: TrafficExportService
    ingestionService: Pick<TrafficIngestionService, 'getState' | 'subscribe'>
    now: () => Date
    queryService: TrafficQueryService
    retentionService: Pick<TrafficRetentionService, 'getState'>
    sharedSecret: string
}

export const createTrafficApp = ({
    backupService,
    exportService,
    ingestionService,
    now,
    queryService,
    retentionService,
    sharedSecret,
}: TrafficAppDependencies) => {
    const backupRoute = createBackupRoute({ backupService })
    const sseStream = createTrafficSseStream({ subscribe: ingestionService.subscribe })
    const trafficRoute = createTrafficRoute({ exportService, ingestionService, queryService, retentionService, sseStream })

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
