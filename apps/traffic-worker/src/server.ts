import { z } from 'zod'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createTrafficApp } from './compose/create-traffic-app'
import { createTrafficDatabase } from './database/create-traffic-database'
import { createTrafficIngestionService } from './service/create-traffic-ingestion-service'
import { createTrafficQueryService } from './service/create-traffic-query-service'
import { createTrafficBackupService } from './service/create-traffic-backup-service'
import { createTrafficExportService } from './service/create-traffic-export-service'

const env = parseEnv(
    z.object({
        TRAFFIC_WORKER_PORT: z.coerce.number().int().positive().default(3003),
        ACCESS_LOG_PATH: z.string().min(1),
        TRAFFIC_SHARED_SECRET_FILE: z.string().min(1),
        BACKUP_ROOT: z.string().min(1).default('/backups'),
        INGEST_CHECKPOINT_PATH: z.string().min(1).default('/data/ingest-checkpoint.json'),
        TRAFFIC_DB_PATH: z.string().min(1),
        TRAFFIC_EXPORT_ROOT: z.string().min(1).default('/backups/traffic-exports'),
        TRAFFIC_RAW_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(14),
    }),
)

const database = createTrafficDatabase({ filePath: env.TRAFFIC_DB_PATH })
const ingestionService = createTrafficIngestionService({
    accessLogPath: env.ACCESS_LOG_PATH,
    checkpointPath: env.INGEST_CHECKPOINT_PATH,
    database,
    now: Date.now,
    retentionMs: env.TRAFFIC_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
})
const queryService = createTrafficQueryService({ database, now: Date.now })
const backupService = createTrafficBackupService({ backupRoot: env.BACKUP_ROOT, database })
const exportService = createTrafficExportService({ database, exportRoot: env.TRAFFIC_EXPORT_ROOT, now: Date.now })
ingestionService.start(1_000)
const app = createTrafficApp({
    backupService,
    exportService,
    ingestionService,
    now: () => new Date(),
    queryService,
    sharedSecret: await loadOrCreateSecret(env.TRAFFIC_SHARED_SECRET_FILE),
})

export default {
    fetch: app.fetch,
    port: env.TRAFFIC_WORKER_PORT,
}
