import type { Database } from 'bun:sqlite'
import type { ControlDatabase } from '@containers/db-schema/database'
import { createEngineAgentClient } from '../service/shared/engine-agent-client/create-engine-agent-client'
import { createAuth } from '../auth/create-auth'
import { createNginxStatusClient } from '../service/shared/nginx/create-nginx-status-client'
import { createNginxRouteProbeClient } from '../service/shared/nginx/create-nginx-route-probe-client'
import { createTrafficWorkerClient } from '../service/shared/traffic-worker-client/create-traffic-worker-client'
import { createArtifactInspectionService } from '../service/domain/upload/create-artifact-inspection-service'
import { createBackupScheduleService } from '../service/domain/job/create-backup-schedule-service'
import { createJobHandlers } from '../service/domain/job/create-job-handlers'
import { createMaintenanceService } from '../service/domain/maintenance/create-maintenance-service'
import type { OperationJobService } from '../service/domain/job/create-operation-job-service'
import { createAppError } from '../lib/error'
import { composeApiKey } from './compose-api-key'
import { composeAudit } from './compose-audit'
import { composeAuth } from './compose-auth'
import { composeBackup } from './compose-backup'
import { composeControlPlane } from './compose-control-plane'
import { composeDeployment } from './compose-deployment'
import { composeDeploymentManifest } from './compose-deployment-manifest'
import { composeDeploymentRelease } from './compose-deployment-release'
import { composeDeploymentSecret } from './compose-deployment-secret'
import { composeNginxProxyRoute } from './compose-nginx'
import { composeNotificationDelivery } from './compose-notification-delivery'
import { composeNotificationDestination } from './compose-notification'
import { composeOperationJob } from './compose-operation-job'
import { composeUpload } from './compose-upload'

type ComposeCore = {
    db: ControlDatabase
    sqlite: Database
}

type ComposeSecrets = {
    agentSharedSecret: string
    authSecret: string
    deploymentSecretKey: string
    notificationSecretKey: string
    trafficWorkerSharedSecret: string
}

type ComposeEnv = {
    agentInternalUrl: string
    artifactRoot: string
    authBaseUrl: string
    authTrustedOrigins: string[]
    backupIntervalHours: number
    backupRetentionCount: number
    backupRoot: string
    controlMigrationsPath: string
    deploymentSecretKeyFile: string
    diskHardAvailableBytes: number
    diskSoftAvailableBytes: number
    invitationBaseUrl: string
    nginxStatusUrl: string
    notificationSecretKeyFile: string
    probeNetworkName: string
    protectedHostnames: string[]
    trafficWorkerInternalUrl: string
    uploadTotalQuotaBytes: number
    apiKeyRateLimitPerMinute?: number
}

type ComposeClients = {
    engineAgentClient: ReturnType<typeof createEngineAgentClient>
    nginxStatusClient: ReturnType<typeof createNginxStatusClient>
    nginxRouteProbeClient: ReturnType<typeof createNginxRouteProbeClient>
    trafficWorkerClient: ReturnType<typeof createTrafficWorkerClient>
}

type ComposeDependencies = {
    core: ComposeCore
    secrets: ComposeSecrets
    env: ComposeEnv
    clients: ComposeClients
}

const PROTECTED_CONTAINERS = [
    'api',
    'containers-api-1',
    'containers-engine-agent-1',
    'containers-nginx-1',
    'containers-traffic-worker-1',
    'containers-web-1',
    'engine-agent',
    'nginx',
    'traffic-worker',
    'web',
]

const PROTECTED_NETWORKS = ['containers_control', 'containers_ingress', 'containers_probe']

export const compose = ({ core, secrets, env, clients }: ComposeDependencies) => {
    const { db, sqlite } = core
    const now = () => new Date()
    const auth = createAuth({
        baseUrl: env.authBaseUrl,
        db,
        secret: secrets.authSecret,
        trustedOrigins: env.authTrustedOrigins,
    })

    const { apiKeyService } = composeApiKey({
        db,
        ...(env.apiKeyRateLimitPerMinute === undefined ? {} : { rateLimitPerMinute: env.apiKeyRateLimitPerMinute }),
    })
    const { auditService } = composeAudit({ db })
    const { authService } = composeAuth({ auth, db, invitationBaseUrl: env.invitationBaseUrl })
    const { deploymentService } = composeDeployment({ db, engineAgentClient: clients.engineAgentClient })
    const { deploymentManifestService } = composeDeploymentManifest({
        db,
        engineAgentClient: clients.engineAgentClient,
        protectedHostnames: env.protectedHostnames,
        protectedNetworks: PROTECTED_NETWORKS,
    })
    const { nginxProxyRouteService } = composeNginxProxyRoute({
        db,
        engineAgentClient: clients.engineAgentClient,
        protectedContainers: PROTECTED_CONTAINERS,
        protectedHostnames: env.protectedHostnames,
    })
    const { deploymentSecretService } = composeDeploymentSecret({ db, masterSecret: secrets.deploymentSecretKey })
    const { backupService } = composeBackup({
        backupRoot: env.backupRoot,
        deploymentSecretKeyFile: env.deploymentSecretKeyFile,
        nginxConfigProvider: async () => (await clients.engineAgentClient.getNginxConfig()).config,
        notificationSecretKeyFile: env.notificationSecretKeyFile,
        now,
        retentionCount: env.backupRetentionCount,
        sqlite,
        trafficWorkerClient: clients.trafficWorkerClient,
    })
    const maintenanceService = createMaintenanceService({ now, sleep: Bun.sleep })
    const { controlPlaneStatusService } = composeControlPlane({
        db,
        sqlite,
        backupService,
        maintenanceService,
        migrationsFolder: env.controlMigrationsPath,
    })
    const { notificationDestinationService } = composeNotificationDestination({ db, masterSecret: secrets.notificationSecretKey })

    let operationJobService: OperationJobService | null = null
    const { notificationDeliveryService } = composeNotificationDelivery({
        db,
        destinationService: notificationDestinationService,
        enqueue: (input) => {
            if (operationJobService === null) {
                throw createAppError('JOB_ENQUEUE_UNAVAILABLE')
            }
            return operationJobService.enqueue(input)
        },
    })

    const { deploymentReleaseService } = composeDeploymentRelease({
        db,
        probeNetwork: env.probeNetworkName,
        deploymentManifestService,
        deploymentSecretService,
        engineAgentClient: clients.engineAgentClient,
        nginxProxyRouteService,
        routeProbe: clients.nginxRouteProbeClient.probe,
        sleep: Bun.sleep,
    })

    const { uploadService } = composeUpload({
        db,
        artifactInspectionService: createArtifactInspectionService(),
        artifactRoot: env.artifactRoot,
        diskHardAvailableBytes: env.diskHardAvailableBytes,
        diskSoftAvailableBytes: env.diskSoftAvailableBytes,
        engineAgentClient: clients.engineAgentClient,
        totalQuotaBytes: env.uploadTotalQuotaBytes,
    })

    const operationJobResult = composeOperationJob({
        db,
        handlers: createJobHandlers({
            backupService,
            deploymentReleaseService,
            deploymentService,
            engineAgentClient: clients.engineAgentClient,
            maintenanceService,
            notificationDeliveryService,
            trafficWorkerClient: clients.trafficWorkerClient,
            uploadService,
        }),
        onFinished: (job) => notificationDeliveryService.onFinished(job),
    })
    operationJobService = operationJobResult.operationJobService

    const backupScheduleService = createBackupScheduleService({
        backupService,
        intervalHours: env.backupIntervalHours,
        now,
        operationJobService: operationJobResult.operationJobService,
    })

    return {
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
        engineAgentClient: clients.engineAgentClient,
        maintenanceService,
        nginxStatusClient: clients.nginxStatusClient,
        nginxProxyRouteService,
        notificationDeliveryService,
        notificationDestinationService,
        operationJobService: operationJobResult.operationJobService,
        trafficWorkerClient: clients.trafficWorkerClient,
        uploadService,
    }
}

export type { ComposeCore, ComposeSecrets, ComposeEnv, ComposeClients, ComposeDependencies }
