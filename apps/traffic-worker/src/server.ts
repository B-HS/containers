import { z } from 'zod'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createTrafficApp } from './compose/create-traffic-app'
import { createQueryWorker } from './db/create-query-worker'
import { createTrafficDatabase } from './db/database'
import { createServerDrain, createShutdownHandler, registerShutdownSignals } from './boot/create-shutdown-handler'
import { createTrafficIngestionService } from './service/domain/create-traffic-ingestion-service'
import { createProxyCandidateService } from './service/domain/create-proxy-candidate-service'
import { createTrafficQueryService } from './service/domain/create-traffic-query-service'
import { createTrafficRetentionService } from './service/domain/create-traffic-retention-service'
import { createTrafficBackupService } from './service/domain/create-traffic-backup-service'
import { createTrafficExportService } from './service/domain/create-traffic-export-service'

const INGESTION_POLL_INTERVAL_MS = 1_000
const SHUTDOWN_DRAIN_TIMEOUT_MS = 8 * 1_000

const env = parseEnv(
    z.object({
        TRAFFIC_WORKER_PORT: z.coerce.number().int().positive().default(3003),
        ACCESS_LOG_PATH: z.string().min(1),
        TRAFFIC_SHARED_SECRET_FILE: z.string().min(1),
        BACKUP_ROOT: z.string().min(1).default('/backups'),
        INGEST_CHECKPOINT_PATH: z.string().min(1).default('/data/ingest-checkpoint.json'),
        TRAFFIC_DB_PATH: z.string().min(1),
        TRAFFIC_MIGRATIONS_PATH: z.string().min(1),
        TRAFFIC_EXPORT_ROOT: z.string().min(1).default('/backups/traffic-exports'),
        TRAFFIC_RAW_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(14),
        TRAFFIC_MAX_EVENT_ROWS: z.coerce.number().int().min(10_000).default(2_000_000),
        TRAFFIC_MAX_DB_BYTES: z.coerce
            .number()
            .int()
            .min(16 * 1_024 * 1_024)
            .default(1_024 * 1_024 * 1_024),
        TRAFFIC_RETENTION_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3_600).default(60),
    }),
)

const database = createTrafficDatabase({ filePath: env.TRAFFIC_DB_PATH, migrationsFolder: env.TRAFFIC_MIGRATIONS_PATH })
const ingestionService = createTrafficIngestionService({
    accessLogPath: env.ACCESS_LOG_PATH,
    checkpointPath: env.INGEST_CHECKPOINT_PATH,
    database,
    now: Date.now,
})
const retentionService = createTrafficRetentionService({
    database,
    maxByteSize: env.TRAFFIC_MAX_DB_BYTES,
    maxRowCount: env.TRAFFIC_MAX_EVENT_ROWS,
    now: Date.now,
    retentionMs: env.TRAFFIC_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
})
const proxyCandidateService = createProxyCandidateService({
    accessLogPath: env.ACCESS_LOG_PATH,
    readTail: async (path, bytes) => {
        const file = Bun.file(path)
        const size = file.size
        return file.slice(Math.max(0, size - bytes), size).text()
    },
})
const queryWorker = createQueryWorker({ filePath: env.TRAFFIC_DB_PATH })
const queryService = createTrafficQueryService({ now: Date.now, queryClient: queryWorker.client })
const backupService = createTrafficBackupService({ backupRoot: env.BACKUP_ROOT, database })
const exportService = createTrafficExportService({ exportRoot: env.TRAFFIC_EXPORT_ROOT, now: Date.now, queryClient: queryWorker.client })
const stopIngestion = ingestionService.start(INGESTION_POLL_INTERVAL_MS)
const stopRetention = retentionService.start(env.TRAFFIC_RETENTION_INTERVAL_SECONDS * 1_000)
const app = createTrafficApp({
    backupService,
    exportService,
    ingestionService,
    now: () => new Date(),
    proxyCandidateService,
    queryService,
    retentionService,
    sharedSecret: await loadOrCreateSecret(env.TRAFFIC_SHARED_SECRET_FILE),
})

const server = Bun.serve({
    fetch: app.fetch,
    port: env.TRAFFIC_WORKER_PORT,
})

registerShutdownSignals(
    createShutdownHandler({
        steps: [
            { name: 'stop-ingestion', run: () => stopIngestion() },
            { name: 'stop-retention', run: () => stopRetention() },
            { name: 'drain-http-server', run: createServerDrain({ server, timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS }) },
            { name: 'close-query-worker', run: () => queryWorker.close() },
            { name: 'close-traffic-database', run: () => database.close() },
        ],
    }),
)
