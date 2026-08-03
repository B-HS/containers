import { z } from 'zod'
import { websocket } from 'hono/bun'
import { parseEnv } from '@containers/config/env'
import { loadOrCreateSecret } from '@containers/config/secret'
import { createControlDatabase } from '@containers/db-schema/database'
import { createEngineAgentClient } from './agent/create-engine-agent-client'
import { createAuth } from './auth/create-auth'
import { loadAuthSecret } from './auth/load-auth-secret'
import { createApp } from './compose/create-app'
import { createAppError } from './lib/app-error'
import { createNginxStatusClient } from './nginx/create-nginx-status-client'
import { createNginxRouteProbeClient } from './nginx/create-nginx-route-probe-client'
import { createAuditService } from './service/domain/audit/create-audit-service'
import { createApiKeyService } from './service/domain/api-key/create-api-key-service'
import { createBackupService } from './service/domain/backup/create-backup-service'
import { createAuthService } from './service/domain/auth/create-auth-service'
import { createDeploymentService } from './service/domain/deployment/create-deployment-service'
import { createDeploymentManifestService } from './service/domain/deployment/create-deployment-manifest-service'
import { createDeploymentReleaseService } from './service/domain/deployment/create-deployment-release-service'
import { createDeploymentSecretService } from './service/domain/deployment/create-deployment-secret-service'
import { createBackupScheduleService } from './service/domain/job/create-backup-schedule-service'
import { createJobHandlers } from './service/domain/job/create-job-handlers'
import { createOperationJobService } from './service/domain/job/create-operation-job-service'
import { createControlPlaneStatusService } from './service/domain/control-plane/create-control-plane-status-service'
import { createMaintenanceService } from './service/domain/maintenance/create-maintenance-service'
import { createNotificationDeliveryService } from './service/domain/notification/create-notification-delivery-service'
import { createNotificationDestinationService } from './service/domain/notification/create-notification-destination-service'
import { createTrafficWorkerClient } from './traffic/create-traffic-worker-client'
import { createNginxProxyRouteService } from './service/domain/nginx/create-nginx-proxy-route-service'
import { createArtifactInspectionService } from './service/domain/upload/create-artifact-inspection-service'
import { createUploadService } from './service/domain/upload/create-upload-service'

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
        DEPLOYMENT_SECRET_KEY_FILE: z.string().min(1).default('/data/deployment-secret-key'),
        NGINX_STATUS_URL: z.url(),
        NOTIFICATION_SECRET_KEY_FILE: z.string().min(1).default('/data/notification-secret-key'),
        PANEL_PUBLIC_URL: z.url(),
        API_KEY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(120),
        TRAFFIC_WORKER_INTERNAL_URL: z.url(),
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
const auth = createAuth({
    baseUrl: env.AUTH_BASE_URL,
    db,
    secret: await loadAuthSecret(env.AUTH_SECRET_FILE),
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
})
const authService = createAuthService({ auth, db, invitationBaseUrl: env.PANEL_PUBLIC_URL, now: () => new Date() })
const auditService = createAuditService({ db, now: () => new Date() })
const apiKeyService = createApiKeyService({ db, now: () => new Date(), rateLimitPerMinute: env.API_KEY_RATE_LIMIT_PER_MINUTE })
const engineAgentClient = createEngineAgentClient({
    baseUrl: env.AGENT_INTERNAL_URL,
    secret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
})
const deploymentService = createDeploymentService({ db, engineAgentClient, now: () => new Date() })
const protectedHostnames = ['api.containers.local', 'panel.containers.local', new URL(env.PANEL_PUBLIC_URL).hostname]
const deploymentManifestService = createDeploymentManifestService({
    db,
    engineAgentClient,
    now: () => new Date(),
    protectedHostnames,
    protectedNetworks: ['containers_control', 'containers_ingress'],
})
const nginxProxyRouteService = createNginxProxyRouteService({
    db,
    engineAgentClient,
    now: () => new Date(),
    protectedHostnames,
})
const nginxRouteBaseUrl = new URL(env.NGINX_STATUS_URL)
nginxRouteBaseUrl.port = '8080'
nginxRouteBaseUrl.pathname = '/'
const nginxRouteProbeClient = createNginxRouteProbeClient({ baseUrl: nginxRouteBaseUrl.toString() })
const deploymentSecretService = createDeploymentSecretService({
    db,
    masterSecret: await loadOrCreateSecret(env.DEPLOYMENT_SECRET_KEY_FILE),
    now: () => new Date(),
})
const trafficWorkerClient = createTrafficWorkerClient({
    baseUrl: env.TRAFFIC_WORKER_INTERNAL_URL,
    secret: await loadOrCreateSecret(env.AGENT_SHARED_SECRET_FILE),
})
const backupService = createBackupService({
    backupRoot: env.BACKUP_ROOT,
    now: () => new Date(),
    retentionCount: env.BACKUP_RETENTION_COUNT,
    sqlite,
    trafficWorkerClient,
})
const maintenanceService = createMaintenanceService({ now: () => new Date(), sleep: Bun.sleep })
const controlPlaneStatusService = createControlPlaneStatusService({
    backupService,
    db,
    maintenanceService,
    migrationsFolder: env.CONTROL_MIGRATIONS_PATH,
    sqlite,
})
const notificationDestinationService = createNotificationDestinationService({
    db,
    masterSecret: await loadOrCreateSecret(env.NOTIFICATION_SECRET_KEY_FILE),
    now: () => new Date(),
})
let operationJobService: ReturnType<typeof createOperationJobService> | null = null
const notificationDeliveryService = createNotificationDeliveryService({
    db,
    destinationService: notificationDestinationService,
    enqueue: (input) => {
        if (operationJobService === null) {
            throw createAppError('JOB_ENQUEUE_UNAVAILABLE')
        }
        return operationJobService.enqueue(input)
    },
    now: () => new Date(),
})
const deploymentReleaseService = createDeploymentReleaseService({
    controlNetwork: env.CONTROL_NETWORK_NAME,
    db,
    deploymentManifestService,
    deploymentSecretService,
    engineAgentClient,
    nginxProxyRouteService,
    now: () => new Date(),
    routeProbe: nginxRouteProbeClient.probe,
    sleep: Bun.sleep,
})
await deploymentReleaseService.reconcileInterrupted()
await deploymentReleaseService.cleanupExpiredContainers()
setInterval(() => void deploymentReleaseService.cleanupExpiredContainers().catch(() => undefined), 60 * 60 * 1_000)
const uploadService = createUploadService({
    artifactInspectionService: createArtifactInspectionService(),
    artifactRoot: env.ARTIFACT_ROOT,
    db,
    diskHardAvailableBytes: env.UPLOAD_DISK_HARD_AVAILABLE_BYTES,
    diskSoftAvailableBytes: env.UPLOAD_DISK_SOFT_AVAILABLE_BYTES,
    engineAgentClient,
    now: () => new Date(),
    totalQuotaBytes: env.UPLOAD_TOTAL_QUOTA_BYTES,
})
operationJobService = createOperationJobService({
    db,
    handlers: createJobHandlers({
        backupService,
        deploymentReleaseService,
        deploymentService,
        engineAgentClient,
        maintenanceService,
        notificationDeliveryService,
        trafficWorkerClient,
        uploadService,
    }),
    now: () => new Date(),
    onFinished: (job) => notificationDeliveryService.onFinished(job),
})
await operationJobService.reconcileInterrupted()
operationJobService.start()
await notificationDeliveryService.reconcileQueued()
const backupScheduleService = createBackupScheduleService({
    backupService,
    intervalHours: env.BACKUP_INTERVAL_HOURS,
    now: () => new Date(),
    operationJobService,
})
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
    nginxStatusClient: createNginxStatusClient({ statusUrl: env.NGINX_STATUS_URL }),
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
