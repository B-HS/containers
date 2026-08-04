import { z } from 'zod'
import { websocket } from 'hono/bun'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createControlDatabase } from '@containers/db-schema/database'
import { createEngineAgentClient } from './service/shared/engine-agent-client/create-engine-agent-client'
import { loadAuthSecret } from './auth/load-auth-secret'
import { createApp } from './compose/create-app'
import { createNginxStatusClient } from './service/shared/nginx/create-nginx-status-client'
import { createNginxRouteProbeClient } from './service/shared/nginx/create-nginx-route-probe-client'
import { createTrafficWorkerClient } from './service/shared/traffic-worker-client/create-traffic-worker-client'
import { compose } from './compose/compose'

const envSchema = z
    .object({
        API_PORT: z.coerce.number().int().positive().default(3001),
        AGENT_INTERNAL_URL: z.url(),
        AGENT_SHARED_SECRET_FILE: z.string().min(1),
        ARTIFACT_ROOT: z.string().min(1),
        BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
        BACKUP_RETENTION_COUNT: z.coerce.number().int().min(2).max(90).default(7),
        BACKUP_ROOT: z.string().min(1).default('/backups'),
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
        DEPLOYMENT_SECRET_KEY_FILE: z.string().min(1).default('/data/deployment-secret-key'),
        NGINX_STATUS_URL: z.url(),
        NOTIFICATION_SECRET_KEY_FILE: z.string().min(1).default('/data/notification-secret-key'),
        PANEL_PUBLIC_URL: z.url(),
        API_KEY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(120),
        TRAFFIC_WORKER_INTERNAL_URL: z.url(),
        TRAFFIC_WORKER_SHARED_SECRET_FILE: z.string().min(1),
        TRAFFIC_EXPORT_ROOT: z.string().min(1).default('/backups/traffic-exports'),
        UPLOAD_DISK_HARD_AVAILABLE_BYTES: z.coerce.number().int().positive().default(17_179_869_184),
        UPLOAD_DISK_SOFT_AVAILABLE_BYTES: z.coerce.number().int().positive().default(34_359_738_368),
        UPLOAD_TOTAL_QUOTA_BYTES: z.coerce.number().int().positive().default(322_122_547_200),
    })
    .refine((input) => input.UPLOAD_DISK_SOFT_AVAILABLE_BYTES > input.UPLOAD_DISK_HARD_AVAILABLE_BYTES, {
        message: 'soft disk watermark는 hard watermark보다 커야 합니다.',
        path: ['UPLOAD_DISK_SOFT_AVAILABLE_BYTES'],
    })

const env = parseEnv(envSchema)

const { db, sqlite } = createControlDatabase({ filePath: env.CONTROL_DB_PATH, migrationsFolder: env.CONTROL_MIGRATIONS_PATH })

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
        deploymentSecretKey: await loadOrCreateSecret(env.DEPLOYMENT_SECRET_KEY_FILE),
        notificationSecretKey: await loadOrCreateSecret(env.NOTIFICATION_SECRET_KEY_FILE),
        trafficWorkerSharedSecret: await loadOrCreateSecret(env.TRAFFIC_WORKER_SHARED_SECRET_FILE),
    },
    env: {
        agentInternalUrl: env.AGENT_INTERNAL_URL,
        artifactRoot: env.ARTIFACT_ROOT,
        authBaseUrl: env.AUTH_BASE_URL,
        authTrustedOrigins: env.AUTH_TRUSTED_ORIGINS,
        backupIntervalHours: env.BACKUP_INTERVAL_HOURS,
        backupRetentionCount: env.BACKUP_RETENTION_COUNT,
        backupRoot: env.BACKUP_ROOT,
        controlMigrationsPath: env.CONTROL_MIGRATIONS_PATH,
        diskHardAvailableBytes: env.UPLOAD_DISK_HARD_AVAILABLE_BYTES,
        diskSoftAvailableBytes: env.UPLOAD_DISK_SOFT_AVAILABLE_BYTES,
        invitationBaseUrl: env.PANEL_PUBLIC_URL,
        nginxStatusUrl: env.NGINX_STATUS_URL,
        probeNetworkName: env.PROBE_NETWORK_NAME,
        protectedHostnames: ['api.containers.local', 'panel.containers.local', new URL(env.PANEL_PUBLIC_URL).hostname],
        trafficWorkerInternalUrl: env.TRAFFIC_WORKER_INTERNAL_URL,
        uploadTotalQuotaBytes: env.UPLOAD_TOTAL_QUOTA_BYTES,
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
    maintenanceService,
    nginxProxyRouteService,
    notificationDeliveryService,
    notificationDestinationService,
    operationJobService,
    uploadService,
} = composed

await deploymentReleaseService.reconcileInterrupted()
await deploymentReleaseService.cleanupExpiredContainers()
setInterval(() => void deploymentReleaseService.cleanupExpiredContainers().catch(() => undefined), 60 * 60 * 1_000)
await uploadService.cleanupExpiredSessions().catch(() => undefined)
setInterval(() => void uploadService.cleanupExpiredSessions().catch(() => undefined), 15 * 60 * 1_000)
await operationJobService.reconcileInterrupted()
operationJobService.start()
await notificationDeliveryService.reconcileQueued()
await backupScheduleService.enqueueIfDue()
setInterval(() => void backupScheduleService.enqueueIfDue().catch(() => undefined), 60 * 1_000)
setInterval(() => void operationJobService.cleanupFinished().catch(() => undefined), 60 * 60 * 1_000)

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
    engineAgentClient,
    maintenanceService,
    nginxStatusClient,
    nginxProxyRouteService,
    controlPlaneStatusService,
    notificationDeliveryService,
    notificationDestinationService,
    operationJobService,
    trafficExportRoot: env.TRAFFIC_EXPORT_ROOT,
    trafficWorkerClient,
    uploadService,
})

export default {
    fetch: app.fetch,
    idleTimeout: 255,
    port: env.API_PORT,
    websocket,
}
