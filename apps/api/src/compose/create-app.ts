import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import type { EngineAgentClient } from '../agent/create-engine-agent-client'
import type { Auth } from '../auth/create-auth'
import { errorResponse } from '../lib/response'
import type { NginxStatusClient } from '../nginx/create-nginx-status-client'
import { createAuditRoute } from '../route/audit/create-audit-route'
import { createApiKeyRoute } from '../route/api-key/create-api-key-route'
import { createBackupRoute } from '../route/backup/create-backup-route'
import { createAuthRoute } from '../route/auth/create-auth-route'
import { createControlRoute } from '../route/control/create-control-route'
import { createInteractiveExecProxyRoute } from '../route/control/create-interactive-exec-proxy-route'
import { createDeploymentManifestRoute } from '../route/deployment/create-deployment-manifest-route'
import { createDeploymentReleaseRoute } from '../route/deployment/create-deployment-release-route'
import { createDeploymentSecretRoute } from '../route/deployment/create-deployment-secret-route'
import { createDeploymentRoute } from '../route/deployment/create-deployment-route'
import { createEngineRoute } from '../route/engine/create-engine-route'
import { createEngineStreamProxyRoute } from '../route/stream/create-engine-stream-proxy-route'
import { createHealthRoute } from '../route/health/create-health-route'
import { createJobRoute } from '../route/job/create-job-route'
import { createMaintenanceRoute } from '../route/maintenance/create-maintenance-route'
import { createNginxRoute } from '../route/nginx/create-nginx-route'
import { createTrafficRoute } from '../route/traffic/create-traffic-route'
import { createUploadRoute } from '../route/upload/create-upload-route'
import type { AuditService } from '../service/domain/audit/create-audit-service'
import type { ApiKeyService } from '../service/domain/api-key/create-api-key-service'
import type { BackupService } from '../service/domain/backup/create-backup-service'
import type { AuthService } from '../service/domain/auth/create-auth-service'
import { createControlService } from '../service/domain/control/create-control-service'
import type { DeploymentService } from '../service/domain/deployment/create-deployment-service'
import type { DeploymentManifestService } from '../service/domain/deployment/create-deployment-manifest-service'
import type { DeploymentReleaseService } from '../service/domain/deployment/create-deployment-release-service'
import type { DeploymentSecretService } from '../service/domain/deployment/create-deployment-secret-service'
import { createEngineService } from '../service/domain/engine/create-engine-service'
import { createHealthService } from '../service/domain/health/create-health-service'
import type { BackupScheduleService } from '../service/domain/job/create-backup-schedule-service'
import type { OperationJobService } from '../service/domain/job/create-operation-job-service'
import type { MaintenanceService } from '../service/domain/maintenance/create-maintenance-service'
import { createNginxService } from '../service/domain/nginx/create-nginx-service'
import type { NginxProxyRouteService } from '../service/domain/nginx/create-nginx-proxy-route-service'
import { createTrafficService } from '../service/domain/traffic/create-traffic-service'
import type { TrafficWorkerClient } from '../traffic/create-traffic-worker-client'
import type { UploadService } from '../service/domain/upload/create-upload-service'

type AppDependencies = {
    apiKeyService: ApiKeyService
    backupScheduleService: Pick<BackupScheduleService, 'getSchedule'>
    auditService: Pick<AuditService, 'list' | 'record'>
    backupService: BackupService
    auth: Pick<Auth, 'handler'>
    authService: Pick<
        AuthService,
        | 'acceptInvitation'
        | 'bootstrapOwner'
        | 'createInvitation'
        | 'getBootstrapStatus'
        | 'getSession'
        | 'isEmailDisabled'
        | 'listUsers'
        | 'requireRecentRole'
        | 'requireRole'
        | 'updateUser'
    >
    deploymentManifestService: DeploymentManifestService
    deploymentReleaseService: DeploymentReleaseService
    deploymentSecretService: DeploymentSecretService
    deploymentService: DeploymentService
    engineAgentClient: EngineAgentClient
    nginxStatusClient: NginxStatusClient
    maintenanceService: Pick<MaintenanceService, 'disable' | 'enable' | 'enter' | 'getStatus' | 'isEnabled' | 'leave'>
    nginxProxyRouteService: Pick<NginxProxyRouteService, 'create' | 'list' | 'remove'>
    operationJobService: Pick<OperationJobService, 'enqueue' | 'get' | 'list' | 'listEvents' | 'requestCancel'>
    trafficWorkerClient: Pick<TrafficWorkerClient, 'getAnalytics' | 'getSummary' | 'openLiveStream'>
    trafficExportRoot?: string
    uploadService: UploadService
}

export const createApp = ({
    auditService,
    apiKeyService,
    auth,
    backupScheduleService,
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
    operationJobService,
    trafficWorkerClient,
    trafficExportRoot = '/backups/traffic-exports',
    uploadService,
}: AppDependencies) => {
    const healthService = createHealthService({ now: () => new Date() })
    const healthRoute = createHealthRoute({ healthService })
    const auditRoute = createAuditRoute({ auditService, authService })
    const engineService = createEngineService({ engineAgentClient })
    const engineRoute = createEngineRoute({ authService, engineService })
    const engineStreamProxyRoute = createEngineStreamProxyRoute({ authService, engineAgentClient })
    const authRoute = createAuthRoute({ auditService, authService })
    const controlService = createControlService({ engineAgentClient })
    const controlRoute = createControlRoute({ auditService, authService, controlService, operationJobService })
    const interactiveExecProxyRoute = createInteractiveExecProxyRoute({ auditService, authService, engineAgentClient })
    const trafficService = createTrafficService({ trafficWorkerClient })
    const trafficRoute = createTrafficRoute({ auditService, authService, operationJobService, trafficExportRoot, trafficService })
    const nginxService = createNginxService({ engineAgentClient, nginxStatusClient })
    const nginxRoute = createNginxRoute({ auditService, authService, nginxProxyRouteService, nginxService })
    const uploadRoute = createUploadRoute({ apiKeyService, authService, uploadService })
    const deploymentRoute = createDeploymentRoute({ apiKeyService, auditService, authService, deploymentService })
    const deploymentManifestRoute = createDeploymentManifestRoute({ apiKeyService, auditService, authService, deploymentManifestService })
    const deploymentReleaseRoute = createDeploymentReleaseRoute({ apiKeyService, auditService, authService, deploymentReleaseService })
    const deploymentSecretRoute = createDeploymentSecretRoute({ apiKeyService, auditService, authService, deploymentSecretService })
    const apiKeyRoute = createApiKeyRoute({ apiKeyService, authService })
    const backupRoute = createBackupRoute({ apiKeyService, auditService, authService, backupService, operationJobService })
    const jobRoute = createJobRoute({ auditService, authService, backupScheduleService, operationJobService })
    const maintenanceRoute = createMaintenanceRoute({ auditService, authService, maintenanceService })
    const loginRateWindows = new Map<string, { count: number; startedAt: number }>()
    const isLoginRateLimited = (headers: Headers) => {
        const key = headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        const timestamp = Date.now()
        const window = loginRateWindows.get(key)
        if (!window || timestamp - window.startedAt >= 60_000) {
            loginRateWindows.set(key, { count: 1, startedAt: timestamp })
            return false
        }
        window.count += 1
        return window.count > 10
    }

    const MUTATING_METHODS = ['DELETE', 'PATCH', 'POST', 'PUT']
    const MAINTENANCE_RETRY_AFTER_SECONDS = 30

    return new Hono()
        .use('*', requestId())
        .use('/api/*', async (context, next) => {
            if (!MUTATING_METHODS.includes(context.req.method) || context.req.path === '/api/maintenance') {
                return next()
            }
            if (maintenanceService.isEnabled()) {
                context.header('retry-after', String(MAINTENANCE_RETRY_AFTER_SECONDS))
                return context.json(errorResponse('MAINTENANCE_MODE', '점검 중입니다. 잠시 후 다시 시도해 주세요.', context.get('requestId')), 503)
            }
            maintenanceService.enter()
            try {
                await next()
            } finally {
                maintenanceService.leave()
            }
        })
        .route('/api', maintenanceRoute)
        .route('/api/health', healthRoute)
        .route('/api', engineRoute)
        .route('/api', engineStreamProxyRoute)
        .route('/api', auditRoute)
        .route('/api', controlRoute)
        .route('/api', interactiveExecProxyRoute)
        .route('/api', trafficRoute)
        .route('/api', nginxRoute)
        .route('/api', uploadRoute)
        .route('/api', deploymentRoute)
        .route('/api', deploymentManifestRoute)
        .route('/api', deploymentReleaseRoute)
        .route('/api', deploymentSecretRoute)
        .route('/api', apiKeyRoute)
        .route('/api', backupRoute)
        .route('/api', jobRoute)
        .route('/api', authRoute)
        .on(['GET', 'POST'], '/api/auth/*', async (context) => {
            if (context.req.path === '/api/auth/sign-up/email') {
                return context.json(errorResponse('SIGN_UP_DISABLED', '공개 가입은 허용되지 않습니다.', context.get('requestId')), 404)
            }

            if (context.req.path === '/api/auth/sign-in/email' && context.req.method === 'POST') {
                if (isLoginRateLimited(context.req.raw.headers)) {
                    context.header('retry-after', '60')
                    return context.json(errorResponse('AUTH_RATE_LIMITED', '로그인 요청 한도를 초과했습니다.', context.get('requestId')), 429)
                }
                const body: unknown = await context.req.raw
                    .clone()
                    .json()
                    .catch(() => undefined)
                const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined
                if (await authService.isEmailDisabled(email).catch(() => false)) {
                    return context.json(errorResponse('ACCOUNT_DISABLED', '비활성화된 계정입니다.', context.get('requestId')), 403)
                }
            }

            return auth.handler(context.req.raw)
        })
}

export type AppType = ReturnType<typeof createApp>
