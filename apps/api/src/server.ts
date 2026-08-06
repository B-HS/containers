import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { websocket } from 'hono/bun'
import { openAPIRouteHandler } from 'hono-openapi'
import { parseEnv } from '@containers/config/env'
import { CONTROL_PLANE_VERSION } from '@containers/contracts/control-plane'
import { loadKeyring } from '@containers/config/keyring'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createControlDatabase } from '@containers/db-schema/database'
import { createEngineAgentClient } from './service/shared/engine-agent-client/create-engine-agent-client'
import { loadAuthSecret } from './auth/load-auth-secret'
import { createApp } from './compose/create-app'
import { createNginxStatusClient } from './service/shared/nginx/create-nginx-status-client'
import { createNginxRouteProbeClient } from './service/shared/nginx/create-nginx-route-probe-client'
import { createTrafficWorkerClient } from './service/shared/traffic-worker-client/create-traffic-worker-client'
import { compose } from './compose/compose'
import { buildPanelSettingServiceDb } from './compose/compose-panel-setting'
import { runStartupTasks, startRecurringTask } from './boot/run-startup-tasks'
import { createServerDrain, createShutdownHandler, registerShutdownSignals } from './boot/create-shutdown-handler'

const MINUTE_MS = 60 * 1_000
const HOUR_MS = 60 * MINUTE_MS
const BACKUP_SCHEDULE_INTERVAL_MS = MINUTE_MS
const CONTAINER_CLEANUP_INTERVAL_MS = HOUR_MS
const JOB_CLEANUP_INTERVAL_MS = HOUR_MS
const UPLOAD_SESSION_CLEANUP_INTERVAL_MS = 15 * MINUTE_MS
const ARTIFACT_RETENTION_INTERVAL_MS = 6 * HOUR_MS
const AUDIT_ARCHIVE_INTERVAL_MS = 12 * HOUR_MS
const OPENAPI_SPEC_PATH = '/api/openapi.json'
const SERVER_IDLE_TIMEOUT_SECONDS = 255
const SHUTDOWN_DRAIN_TIMEOUT_MS = 8 * 1_000

const envSchema = z
    .object({
        API_PORT: z.coerce.number().int().positive().default(3001),
        AGENT_INTERNAL_URL: z.url(),
        AGENT_SHARED_SECRET_FILE: z.string().min(1),
        ARTIFACT_ROOT: z.string().min(1),
        BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
        BACKUP_RETENTION_COUNT: z.coerce.number().int().min(2).max(90).default(7),
        BACKUP_ROOT: z.string().min(1).default('/backups'),
        BACKUP_SIZE_MARGIN_RATIO: z.coerce.number().min(1).max(10).default(1.5),
        BACKUP_TOTAL_QUOTA_BYTES: z.coerce.number().int().positive().default(68_719_476_736),
        AUTH_BASE_URL: z.url(),
        AUTH_SECRET_FILE: z.string().min(1),
        AUTH_TRUSTED_ORIGINS: z
            .string()
            .min(1)
            .transform((value) => value.split(',').map((origin) => origin.trim())),
        CONTROL_DB_PATH: z.string().min(1),
        CONTROL_MIGRATIONS_PATH: z.string().min(1),
        CONTROL_NETWORK_NAME: z.string().min(1).default('containers_control'),
        PROBE_NETWORK_NAME: z.string().min(1).default('containers_probe'),
        ROUTABLE_NETWORK_NAMES: z
            .string()
            .min(1)
            .default('containers_edge')
            .transform((value) => value.split(',').map((name) => name.trim())),
        DEPLOYMENT_SECRET_KEY_FILE: z.string().min(1).default('/data/deployment-secret-key'),
        NGINX_STATUS_URL: z.url(),
        NOTIFICATION_SECRET_KEY_FILE: z.string().min(1).default('/data/notification-secret-key'),
        PANEL_PUBLIC_URL: z.url(),
        API_KEY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(120),
        API_DOCS_ENABLED: z.stringbool().default(false),
        TRAFFIC_WORKER_INTERNAL_URL: z.url(),
        TRAFFIC_WORKER_SHARED_SECRET_FILE: z.string().min(1),
        TRAFFIC_EXPORT_ROOT: z.string().min(1).default('/backups/traffic-exports'),
        UPLOAD_DISK_HARD_AVAILABLE_BYTES: z.coerce.number().int().positive().default(17_179_869_184),
        UPLOAD_DISK_SOFT_AVAILABLE_BYTES: z.coerce.number().int().positive().default(34_359_738_368),
        UPLOAD_TOTAL_QUOTA_BYTES: z.coerce.number().int().positive().default(34_359_738_368),
        ARTIFACT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(30),
        AUDIT_ARCHIVE_ROOT: z.string().min(1).default('/backups/audit-archives'),
        AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3_650).default(365),
        ARTIFACT_RETENTION_MINIMUM_COUNT: z.coerce.number().int().min(1).max(1_000).default(5),
    })
    .refine((input) => input.UPLOAD_DISK_SOFT_AVAILABLE_BYTES > input.UPLOAD_DISK_HARD_AVAILABLE_BYTES, {
        message: 'soft disk watermark는 hard watermark보다 커야 합니다.',
        path: ['UPLOAD_DISK_SOFT_AVAILABLE_BYTES'],
    })

const env = parseEnv(envSchema)

const { db, sqlite } = createControlDatabase({ filePath: env.CONTROL_DB_PATH, migrationsFolder: env.CONTROL_MIGRATIONS_PATH })

const storedPublicOrigin = buildPanelSettingServiceDb(db).load()?.publicOrigin ?? null
const authBaseUrl = storedPublicOrigin ?? env.AUTH_BASE_URL
const panelPublicUrl = storedPublicOrigin ?? env.PANEL_PUBLIC_URL

const engineAgentClient = createEngineAgentClient({
    baseUrl: env.AGENT_INTERNAL_URL,
    secret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
})
const nginxStatusClient = createNginxStatusClient({ statusUrl: env.NGINX_STATUS_URL })
const nginxRouteBaseUrl = new URL(env.NGINX_STATUS_URL)
nginxRouteBaseUrl.port = '8080'
nginxRouteBaseUrl.pathname = '/'
const nginxRouteProbeClient = createNginxRouteProbeClient({ baseUrl: nginxRouteBaseUrl.toString() })
const trafficWorkerClient = createTrafficWorkerClient({
    baseUrl: env.TRAFFIC_WORKER_INTERNAL_URL,
    secret: await loadOrCreateSecret(env.TRAFFIC_WORKER_SHARED_SECRET_FILE),
})

const composed = compose({
    core: { db, sqlite },
    secrets: {
        agentSharedSecret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
        authSecret: await loadAuthSecret(env.AUTH_SECRET_FILE),
        deploymentKeyring: await loadKeyring(env.DEPLOYMENT_SECRET_KEY_FILE),
        notificationKeyring: await loadKeyring(env.NOTIFICATION_SECRET_KEY_FILE),
        trafficWorkerSharedSecret: await loadOrCreateSecret(env.TRAFFIC_WORKER_SHARED_SECRET_FILE),
    },
    env: {
        agentInternalUrl: env.AGENT_INTERNAL_URL,
        artifactRoot: env.ARTIFACT_ROOT,
        authBaseUrl,
        authTrustedOrigins: env.AUTH_TRUSTED_ORIGINS,
        backupIntervalHours: env.BACKUP_INTERVAL_HOURS,
        backupRetentionCount: env.BACKUP_RETENTION_COUNT,
        backupRoot: env.BACKUP_ROOT,
        backupSizeMarginRatio: env.BACKUP_SIZE_MARGIN_RATIO,
        backupTotalQuotaBytes: env.BACKUP_TOTAL_QUOTA_BYTES,
        controlMigrationsPath: env.CONTROL_MIGRATIONS_PATH,
        deploymentSecretKeyFile: env.DEPLOYMENT_SECRET_KEY_FILE,
        diskHardAvailableBytes: env.UPLOAD_DISK_HARD_AVAILABLE_BYTES,
        diskSoftAvailableBytes: env.UPLOAD_DISK_SOFT_AVAILABLE_BYTES,
        invitationBaseUrl: panelPublicUrl,
        nginxStatusUrl: env.NGINX_STATUS_URL,
        notificationSecretKeyFile: env.NOTIFICATION_SECRET_KEY_FILE,
        probeNetworkName: env.PROBE_NETWORK_NAME,
        routableNetworks: env.ROUTABLE_NETWORK_NAMES,
        protectedHostnames: ['api.containers.local', 'panel.containers.local', new URL(panelPublicUrl).hostname],
        trafficWorkerInternalUrl: env.TRAFFIC_WORKER_INTERNAL_URL,
        artifactRetentionDays: env.ARTIFACT_RETENTION_DAYS,
        auditArchiveRoot: env.AUDIT_ARCHIVE_ROOT,
        auditRetentionDays: env.AUDIT_RETENTION_DAYS,
        artifactRetentionMinimumCount: env.ARTIFACT_RETENTION_MINIMUM_COUNT,
        uploadTotalQuotaBytes: env.UPLOAD_TOTAL_QUOTA_BYTES,
        workerId: randomUUID(),
        apiKeyRateLimitPerMinute: env.API_KEY_RATE_LIMIT_PER_MINUTE,
    },
    clients: { engineAgentClient, nginxStatusClient, nginxRouteProbeClient, trafficWorkerClient },
})

const {
    apiKeyService,
    auth,
    authService,
    auditService,
    backupService,
    backupScheduleService,
    controlPlaneStatusService,
    deploymentManifestService,
    deploymentReleaseService,
    deploymentSecretService,
    deploymentService,
    deploymentStackReleaseService,
    deploymentStackService,
    maintenanceService,
    nginxProxyRouteService,
    panelSettingService,
    trustedProxyService,
    notificationDeliveryService,
    notificationDestinationService,
    operationJobService,
    readinessService,
    secretRotationService,
    uploadService,
} = composed

let stopOperationJobWorker: (() => void) | null = null

await runStartupTasks({
    tasks: [
        { name: 'deployment-release-reconcile-interrupted', run: () => deploymentReleaseService.reconcileInterrupted() },
        { name: 'deployment-stack-release-reconcile-interrupted', run: () => deploymentStackReleaseService.reconcileInterrupted() },
        { name: 'deployment-release-cleanup-expired-containers', run: () => deploymentReleaseService.cleanupExpiredContainers() },
        { name: 'upload-cleanup-expired-sessions', run: () => uploadService.cleanupExpiredSessions() },
        { name: 'artifact-cleanup-expired', run: () => uploadService.cleanupExpiredArtifacts() },
        { name: 'operation-job-reconcile-interrupted', run: () => operationJobService.reconcileInterrupted() },
        {
            name: 'operation-job-start',
            run: async () => {
                stopOperationJobWorker = operationJobService.start()
            },
        },
        { name: 'notification-delivery-reconcile-queued', run: () => notificationDeliveryService.reconcileQueued() },
        { name: 'nginx-route-reconcile', run: () => nginxProxyRouteService.reconcileRoutes() },
        { name: 'backup-schedule-enqueue-if-due', run: () => backupScheduleService.enqueueIfDue() },
    ],
})

const recurringTasks = [
    startRecurringTask({
        intervalMs: CONTAINER_CLEANUP_INTERVAL_MS,
        name: 'deployment-release-cleanup-expired-containers',
        run: () => deploymentReleaseService.cleanupExpiredContainers(),
    }),
    startRecurringTask({
        intervalMs: UPLOAD_SESSION_CLEANUP_INTERVAL_MS,
        name: 'upload-cleanup-expired-sessions',
        run: () => uploadService.cleanupExpiredSessions(),
    }),
    startRecurringTask({
        intervalMs: ARTIFACT_RETENTION_INTERVAL_MS,
        name: 'artifact-cleanup-expired',
        run: () => uploadService.cleanupExpiredArtifacts(),
    }),
    startRecurringTask({
        intervalMs: AUDIT_ARCHIVE_INTERVAL_MS,
        name: 'audit-archive-expired',
        run: () => auditService.archiveExpired(),
    }),
    startRecurringTask({
        intervalMs: BACKUP_SCHEDULE_INTERVAL_MS,
        name: 'backup-schedule-enqueue-if-due',
        run: () => backupScheduleService.enqueueIfDue(),
    }),
    startRecurringTask({
        intervalMs: JOB_CLEANUP_INTERVAL_MS,
        name: 'operation-job-cleanup-finished',
        run: () => operationJobService.cleanupFinished(),
    }),
]

const app = createApp({
    apiKeyService,
    backupScheduleService,
    auditService,
    auth,
    authService,
    backupService,
    deploymentManifestService,
    deploymentReleaseService,
    deploymentSecretService,
    deploymentService,
    deploymentStackReleaseService,
    deploymentStackService,
    engineAgentClient,
    maintenanceService,
    nginxStatusClient,
    nginxProxyRouteService,
    panelSettingService,
    trustedProxyService,
    controlPlaneStatusService,
    notificationDeliveryService,
    notificationDestinationService,
    operationJobService,
    readinessService,
    secretRotationService,
    trafficExportRoot: env.TRAFFIC_EXPORT_ROOT,
    trafficWorkerClient,
    uploadService,
})

if (env.API_DOCS_ENABLED) {
    app.get(
        OPENAPI_SPEC_PATH,
        openAPIRouteHandler(app, {
            documentation: {
                info: {
                    description: 'Containers control plane API. 비production 환경에서만 노출한다.',
                    title: 'Containers Control Plane API',
                    version: CONTROL_PLANE_VERSION,
                },
            },
        }),
    )
}

const server = Bun.serve({
    fetch: app.fetch,
    idleTimeout: SERVER_IDLE_TIMEOUT_SECONDS,
    port: env.API_PORT,
    websocket,
})

registerShutdownSignals(
    createShutdownHandler({
        steps: [
            { name: 'stop-operation-job-worker', run: () => stopOperationJobWorker?.() },
            { name: 'stop-recurring-tasks', run: () => recurringTasks.forEach((task) => clearInterval(task)) },
            { name: 'drain-http-server', run: createServerDrain({ server, timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS }) },
            { name: 'close-control-database', run: () => sqlite.close(false) },
        ],
    }),
)
