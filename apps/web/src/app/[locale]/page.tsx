import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { getApiKeys } from '@entities/api-key/api-key.api'
import { getAuditEvents } from '@entities/audit/audit.api'
import { getArtifacts } from '@entities/artifact/artifact.api'
import { getBackups } from '@entities/backup/backup.api'
import { getBackupSchedule, getJobs } from '@entities/job/job.api'
import { getMaintenanceStatus } from '@entities/maintenance/maintenance.api'
import { getAuthGate } from '@entities/auth/auth.api'
import { getDeploymentManifests, getDeploymentReleases } from '@entities/deployment/deployment.api'
import { getDeploymentSecrets } from '@entities/deployment-secret/deployment-secret.api'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getApiHealth } from '@entities/health/health.api'
import { getImages } from '@entities/image/image.api'
import { getInfrastructure, getPrunePreview, getRegistryCredentials } from '@entities/infrastructure/infrastructure.api'
import { getNginxConfig, getNginxRoutes, getNginxStatus } from '@entities/nginx/nginx.api'
import { getTrafficAnalytics, getTrafficSummary } from '@entities/traffic/traffic.api'
import { getManagedUsers } from '@entities/user/user.api'
import { AuthPanel } from '@features/auth-panel/auth-panel'
import { LogoutButton } from '@features/logout-button/logout-button'
import { ApiKeyControlWidget } from '@widgets/api-key-control/api-key-control-widget'
import { ArtifactControlWidget } from '@widgets/artifact-control/artifact-control-widget'
import { BackupControlWidget } from '@widgets/backup-control/backup-control-widget'
import { JobControlWidget } from '@widgets/job-control/job-control-widget'
import { AuditLogWidget } from '@widgets/audit-log/audit-log-widget'
import { ContainerCreateWidget } from '@widgets/container-create/container-create-widget'
import { ContainerControlWidget } from '@widgets/container-control/container-control-widget'
import { DeploymentControlWidget } from '@widgets/deployment-control/deployment-control-widget'
import { DeploymentSecretControlWidget } from '@widgets/deployment-secret-control/deployment-secret-control-widget'
import { ImageControlWidget } from '@widgets/image-control/image-control-widget'
import { InfrastructureControlWidget } from '@widgets/infrastructure-control/infrastructure-control-widget'
import { PruneControlWidget } from '@widgets/prune-control/prune-control-widget'
import { RegistryControlWidget } from '@widgets/registry-control/registry-control-widget'
import { InvitationControlWidget } from '@widgets/invitation-control/invitation-control-widget'
import { NginxConfigWidget } from '@widgets/nginx-config/nginx-config-widget'
import { NginxRouteControlWidget } from '@widgets/nginx-route-control/nginx-route-control-widget'
import { OverviewWidget } from '@widgets/overview/overview-widget'
import { TrafficAnalyticsWidget } from '@widgets/traffic-analytics/traffic-analytics-widget'
import { UserManagementWidget } from '@widgets/user-management/user-management-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'
const BYTE_GIB = 1_073_741_824

const formatGib = (bytes: number) => `${(bytes / BYTE_GIB).toFixed(1)} GiB`

const DashboardPage = async () => {
    const [translations, authTranslations, requestHeaders] = await Promise.all([getTranslations('Dashboard'), getTranslations('Auth'), headers()])
    const authGate = await getAuthGate(API_INTERNAL_URL, requestHeaders.get('cookie') ?? '')

    if (authGate.mode !== 'authenticated') {
        return (
            <AuthPanel
                mode={authGate.mode}
                labels={{
                    email: authTranslations('email'),
                    loginAction: authTranslations('loginAction'),
                    loginDescription: authTranslations('loginDescription'),
                    loginTitle: authTranslations('loginTitle'),
                    name: authTranslations('name'),
                    ownerAction: authTranslations('ownerAction'),
                    ownerDescription: authTranslations('ownerDescription'),
                    ownerTitle: authTranslations('ownerTitle'),
                    password: authTranslations('password'),
                    pending: authTranslations('pending'),
                    unknownError: authTranslations('unknownError'),
                }}
            />
        )
    }
    const cookie = requestHeaders.get('cookie') ?? ''
    const canManageApiKeys = ['owner', 'admin'].includes(authGate.session.role)
    const canManageSecrets = ['owner', 'admin'].includes(authGate.session.role)
    const isOwner = authGate.session.role === 'owner'
    const canViewAudit = ['owner', 'admin', 'viewer', 'auditor'].includes(authGate.session.role)
    const [
        apiAvailable,
        engineDashboard,
        trafficSummary,
        trafficAnalytics,
        nginxStatus,
        nginxConfig,
        nginxRoutes,
        artifacts,
        images,
        infrastructure,
        deploymentManifests,
        deploymentReleases,
        deploymentSecrets,
        managedUsers,
        auditEvents,
        apiKeys,
        backups,
        jobs,
        backupSchedule,
        maintenanceStatus,
        prunePreview,
        registryCredentials,
    ] = await Promise.all([
        getApiHealth(API_INTERNAL_URL).then(
            () => true,
            () => false,
        ),
        getEngineDashboard(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficSummary(API_INTERNAL_URL, cookie).catch(() => undefined),
        getTrafficAnalytics(API_INTERNAL_URL, cookie).catch(() => undefined),
        getNginxStatus(API_INTERNAL_URL, cookie).catch(() => undefined),
        getNginxConfig(API_INTERNAL_URL, cookie).catch(() => undefined),
        getNginxRoutes(API_INTERNAL_URL, cookie).catch(() => []),
        getArtifacts(API_INTERNAL_URL, cookie).catch(() => []),
        getImages(API_INTERNAL_URL, cookie).catch(() => []),
        getInfrastructure(API_INTERNAL_URL, cookie).catch(() => ({ networks: [], volumes: [] })),
        getDeploymentManifests(API_INTERNAL_URL, cookie).catch(() => []),
        getDeploymentReleases(API_INTERNAL_URL, cookie).catch(() => []),
        canManageSecrets ? getDeploymentSecrets(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        isOwner ? getManagedUsers(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        canViewAudit ? getAuditEvents(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        canManageApiKeys ? getApiKeys(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        isOwner ? getBackups(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        canManageApiKeys ? getJobs(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
        canManageApiKeys ? getBackupSchedule(API_INTERNAL_URL, cookie).catch(() => undefined) : Promise.resolve(undefined),
        canManageApiKeys ? getMaintenanceStatus(API_INTERNAL_URL, cookie).catch(() => undefined) : Promise.resolve(undefined),
        canManageApiKeys ? getPrunePreview(API_INTERNAL_URL, cookie).catch(() => undefined) : Promise.resolve(undefined),
        canManageApiKeys ? getRegistryCredentials(API_INTERNAL_URL, cookie).catch(() => []) : Promise.resolve([]),
    ])
    const diskValue = engineDashboard
        ? `${formatGib(engineDashboard.overview.disk.usedBytes)} / ${formatGib(engineDashboard.overview.disk.capacityBytes)}`
        : undefined

    return (
        <div className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[256px_minmax(0,1fr)_320px]">
            <aside className="hidden bg-sidebar p-3 lg:block">
                <p className="text-sm font-semibold">Containers</p>
                <p className="mt-8 text-xs text-muted-foreground">{translations('navigation')}</p>
            </aside>
            <main className="min-w-0 p-3">
                <header className="bg-card p-3">
                    <h1 className="text-xl font-semibold tracking-tight">{translations('heading')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{translations('subtitle')}</p>
                </header>
                <div className="mt-px">
                    <OverviewWidget
                        apiAvailable={apiAvailable}
                        containerCount={engineDashboard?.containers.length}
                        degradedLabel={translations('degraded')}
                        diskValue={diskValue}
                        engineValue={engineDashboard ? `v${engineDashboard.overview.version}` : undefined}
                        healthyLabel={translations('healthy')}
                        labels={{
                            api: translations('api'),
                            containers: translations('containers'),
                            disk: translations('disk'),
                            engine: translations('engine'),
                            nginx: translations('nginx'),
                            traffic: translations('traffic'),
                        }}
                        nginxValue={nginxStatus ? `${nginxStatus.activeConnections} active` : undefined}
                        trafficValue={trafficSummary ? `${trafficSummary.requestsPerSecond.toFixed(2)} req/s` : undefined}
                    />
                </div>
                <TrafficAnalyticsWidget
                    analytics={trafficAnalytics}
                    canExport={canManageApiKeys}
                    labels={{
                        average: translations('trafficAverage'),
                        bytes: translations('trafficBytes'),
                        empty: translations('trafficEmpty'),
                        errorRate: translations('trafficErrorRate'),
                        latency: translations('trafficLatency'),
                        maskedIp: translations('trafficMaskedIp'),
                        path: translations('trafficPath'),
                        pause: translations('trafficLivePause'),
                        recent: translations('trafficRecent'),
                        requests: translations('trafficRequests'),
                        resume: translations('trafficLiveResume'),
                        status: translations('trafficStatus'),
                        title: translations('trafficAnalytics'),
                        topPaths: translations('trafficTopPaths'),
                        download: translations('trafficExportDownload'),
                        exportCsv: translations('trafficExportCsv'),
                        exportFailed: translations('trafficExportFailed'),
                        exportNdjson: translations('trafficExportNdjson'),
                    }}
                />
                {canManageSecrets ? (
                    <DeploymentSecretControlWidget
                        secrets={deploymentSecrets}
                        labels={{
                            confirmation: translations('deploymentSecretConfirmation'),
                            empty: translations('deploymentSecretEmpty'),
                            failed: translations('deploymentSecretFailed'),
                            reference: translations('deploymentSecretReference'),
                            remove: translations('remove'),
                            save: translations('deploymentSecretSave'),
                            title: translations('deploymentSecretControl'),
                            value: translations('deploymentSecretValue'),
                            valueNotice: translations('deploymentSecretValueNotice'),
                            version: translations('deploymentVersion'),
                        }}
                    />
                ) : null}
                <DeploymentControlWidget
                    images={images}
                    manifests={deploymentManifests}
                    networks={infrastructure.networks}
                    releases={deploymentReleases}
                    role={authGate.session.role}
                    labels={{
                        command: translations('command'),
                        cpu: translations('containerCpu'),
                        create: translations('deploymentManifestCreate'),
                        deploy: translations('deploymentReleaseStart'),
                        deploying: translations('deploymentReleaseStarting'),
                        empty: translations('deploymentEmpty'),
                        failed: translations('deploymentFailed'),
                        healthPath: translations('deploymentHealthPath'),
                        hostname: translations('nginxRouteHostname'),
                        image: translations('image'),
                        manifest: translations('deploymentManifest'),
                        memory: translations('containerMemory'),
                        name: translations('containerName'),
                        network: translations('containerNetwork'),
                        observation: translations('deploymentObservation'),
                        path: translations('nginxRoutePath'),
                        port: translations('containerPort'),
                        recentAuth: translations('deploymentRecentAuth'),
                        release: translations('deploymentRelease'),
                        rollback: translations('deploymentRollback'),
                        rollingBack: translations('deploymentRollingBack'),
                        secretBindings: translations('deploymentSecretBindings'),
                        status: translations('state'),
                        title: translations('deploymentControl'),
                        version: translations('deploymentVersion'),
                    }}
                />
                <NginxConfigWidget
                    role={authGate.session.role}
                    state={nginxConfig}
                    labels={{
                        apply: translations('applyNginx'),
                        applying: translations('applyingNginx'),
                        failed: translations('nginxConfigFailed'),
                        history: translations('revisionHistory'),
                        protectedNotice: translations('nginxProtectedNotice'),
                        sha256: translations('checksum'),
                        success: translations('nginxApplied'),
                        title: translations('nginxConfig'),
                    }}
                />
                <NginxRouteControlWidget
                    containers={
                        engineDashboard?.containers.map((container) => container.names[0]?.replace(/^\//, '') ?? container.id.slice(0, 12)) ?? []
                    }
                    role={authGate.session.role}
                    routes={nginxRoutes}
                    labels={{
                        bodySize: translations('nginxRouteBodySize'),
                        confirmation: translations('nginxRouteConfirmation'),
                        container: translations('nginxRouteContainer'),
                        create: translations('create'),
                        empty: translations('nginxRouteEmpty'),
                        failed: translations('nginxRouteFailed'),
                        hostname: translations('nginxRouteHostname'),
                        path: translations('nginxRoutePath'),
                        port: translations('nginxRoutePort'),
                        protocol: translations('nginxRouteProtocol'),
                        remove: translations('remove'),
                        stripPrefix: translations('nginxRouteStripPrefix'),
                        timeout: translations('nginxRouteTimeout'),
                        title: translations('nginxRouteControl'),
                    }}
                />
                <ArtifactControlWidget
                    artifacts={artifacts}
                    role={authGate.session.role}
                    labels={{
                        artifactType: translations('artifactType'),
                        checksum: translations('checksum'),
                        empty: translations('artifactEmpty'),
                        failed: translations('uploadFailed'),
                        file: translations('file'),
                        load: translations('loadImage'),
                        loading: translations('loading'),
                        progress: translations('uploadProgress'),
                        title: translations('artifactControl'),
                        upload: translations('upload'),
                        uploading: translations('uploading'),
                        storageWarning: translations('uploadStorageWarning'),
                    }}
                />
                <ImageControlWidget
                    images={images}
                    role={authGate.session.role}
                    labels={{
                        confirmation: translations('imageRemoveConfirmation'),
                        empty: translations('imageEmpty'),
                        failed: translations('imageActionFailed'),
                        force: translations('force'),
                        remove: translations('remove'),
                        size: translations('size'),
                        title: translations('imageControl'),
                    }}
                />
                {canManageApiKeys ? (
                    <RegistryControlWidget
                        credentials={registryCredentials}
                        role={authGate.session.role}
                        labels={{
                            confirmation: translations('registryConfirmation'),
                            credential: translations('registryCredential'),
                            empty: translations('registryEmpty'),
                            failed: translations('registryFailed'),
                            name: translations('registryName'),
                            notice: translations('registryNotice'),
                            password: translations('registryPassword'),
                            publicCredential: translations('registryPublic'),
                            pull: translations('registryPull'),
                            pullReference: translations('registryPullReference'),
                            remove: translations('remove'),
                            rotate: translations('registryRotate'),
                            save: translations('registrySave'),
                            serverAddress: translations('registryServerAddress'),
                            started: translations('registryStarted'),
                            title: translations('registryTitle'),
                            username: translations('registryUsername'),
                            version: translations('registryVersion'),
                        }}
                    />
                ) : null}
                <InfrastructureControlWidget
                    networks={infrastructure.networks}
                    role={authGate.session.role}
                    volumes={infrastructure.volumes}
                    labels={{
                        confirmation: translations('infrastructureConfirmation'),
                        containers: translations('containers'),
                        create: translations('create'),
                        driver: translations('infrastructureDriver'),
                        empty: translations('infrastructureEmpty'),
                        failed: translations('infrastructureFailed'),
                        force: translations('force'),
                        gateway: translations('gateway'),
                        internal: translations('internalNetwork'),
                        networks: translations('networks'),
                        networkName: translations('networkName'),
                        remove: translations('remove'),
                        size: translations('size'),
                        subnet: translations('subnet'),
                        title: translations('infrastructureControl'),
                        volumes: translations('volumes'),
                        volumeName: translations('volumeName'),
                    }}
                />
                {canManageApiKeys ? (
                    <PruneControlWidget
                        initialPreview={prunePreview}
                        role={authGate.session.role}
                        labels={{
                            buildCache: translations('pruneBuildCache'),
                            confirmation: translations('pruneConfirmation'),
                            containers: translations('containers'),
                            execute: translations('pruneExecute'),
                            failed: translations('pruneFailed'),
                            images: translations('imageControl'),
                            includeVolumes: translations('pruneIncludeVolumes'),
                            networks: translations('networks'),
                            notice: translations('pruneNotice'),
                            preview: translations('prunePreview'),
                            protected: translations('pruneProtected'),
                            reclaimable: translations('pruneReclaimable'),
                            started: translations('pruneStarted'),
                            title: translations('pruneTitle'),
                            volumes: translations('volumes'),
                        }}
                    />
                ) : null}
                {canManageApiKeys ? (
                    <ApiKeyControlWidget
                        apiKeys={apiKeys}
                        labels={{
                            create: translations('createApiKey'),
                            createdToken: translations('createdToken'),
                            empty: translations('apiKeyEmpty'),
                            expires: translations('expiresInDays'),
                            failed: translations('apiKeyFailed'),
                            name: translations('apiKeyName'),
                            revoke: translations('revoke'),
                            scopes: translations('scopes'),
                            title: translations('apiKeyControl'),
                            tokenWarning: translations('tokenWarning'),
                        }}
                    />
                ) : null}
                {isOwner ? (
                    <BackupControlWidget
                        backups={backups}
                        labels={{
                            confirmation: translations('backupConfirmation'),
                            create: translations('backupCreate'),
                            empty: translations('backupEmpty'),
                            failed: translations('backupFailed'),
                            label: translations('backupLabel'),
                            notice: translations('backupNotice'),
                            remove: translations('remove'),
                            restore: translations('backupRestore'),
                            restored: translations('backupRestored'),
                            size: translations('size'),
                            title: translations('backupControl'),
                        }}
                    />
                ) : null}
                {canManageApiKeys ? (
                    <JobControlWidget
                        jobs={jobs}
                        maintenance={maintenanceStatus}
                        schedule={backupSchedule}
                        labels={{
                            attempt: translations('jobAttempt'),
                            cancel: translations('jobCancel'),
                            cancelFailed: translations('jobCancelFailed'),
                            empty: translations('jobEmpty'),
                            finished: translations('jobFinished'),
                            interval: translations('jobInterval'),
                            lastFailure: translations('jobLastFailure'),
                            lastSuccess: translations('jobLastSuccess'),
                            maintenance: translations('jobMaintenance'),
                            nextRun: translations('jobNextRun'),
                            none: translations('jobNone'),
                            scheduled: translations('jobScheduled'),
                            title: translations('jobControl'),
                        }}
                    />
                ) : null}
                <InvitationControlWidget
                    role={authGate.session.role}
                    labels={{
                        copy: translations('copy'),
                        create: translations('createInvitation'),
                        email: translations('invitationEmail'),
                        expires: translations('invitationExpires'),
                        failed: translations('invitationFailed'),
                        link: translations('invitationLink'),
                        role: translations('invitationRole'),
                        title: translations('invitationControl'),
                        warning: translations('invitationWarning'),
                    }}
                />
                {isOwner ? (
                    <UserManagementWidget
                        currentUserId={authGate.session.user.id}
                        users={managedUsers}
                        labels={{
                            active: translations('userActive'),
                            apply: translations('applyRole'),
                            disable: translations('disableUser'),
                            disabled: translations('userDisabled'),
                            empty: translations('userEmpty'),
                            enable: translations('enableUser'),
                            failed: translations('userManagementFailed'),
                            role: translations('invitationRole'),
                            title: translations('userManagement'),
                        }}
                    />
                ) : null}
                {canViewAudit ? (
                    <AuditLogWidget
                        events={auditEvents}
                        labels={{
                            actor: translations('auditActor'),
                            empty: translations('auditEmpty'),
                            filter: translations('auditFilter'),
                            operation: translations('auditOperation'),
                            result: translations('auditResult'),
                            target: translations('auditTarget'),
                            title: translations('auditLog'),
                        }}
                    />
                ) : null}
                <ContainerCreateWidget
                    images={images}
                    networks={infrastructure.networks}
                    role={authGate.session.role}
                    labels={{
                        autoStart: translations('containerAutoStart'),
                        command: translations('command'),
                        cpu: translations('containerCpu'),
                        create: translations('create'),
                        failed: translations('containerCreateFailed'),
                        image: translations('image'),
                        memory: translations('containerMemory'),
                        name: translations('containerName'),
                        network: translations('containerNetwork'),
                        port: translations('containerPort'),
                        readOnly: translations('containerReadOnly'),
                        title: translations('containerCreate'),
                    }}
                />
                <ContainerControlWidget
                    containers={engineDashboard?.containers ?? []}
                    role={authGate.session.role}
                    labels={{
                        actionFailed: translations('actionFailed'),
                        command: translations('command'),
                        close: translations('close'),
                        container: translations('container'),
                        empty: translations('empty'),
                        exec: translations('exec'),
                        force: translations('force'),
                        image: translations('image'),
                        inspect: translations('inspectAndLogs'),
                        inspectFailed: translations('inspectFailed'),
                        liveLogs: translations('liveLogs'),
                        liveLogsFailed: translations('liveLogsFailed'),
                        liveLogsStart: translations('liveLogsStart'),
                        liveLogsStop: translations('liveLogsStop'),
                        pause: translations('pause'),
                        remove: translations('remove'),
                        removeConfirmation: translations('removeConfirmation'),
                        restart: translations('restart'),
                        running: translations('commandHelp'),
                        start: translations('start'),
                        state: translations('state'),
                        stop: translations('stop'),
                        terminal: translations('terminal'),
                        terminalConnect: translations('terminalConnect'),
                        terminalDisconnected: translations('terminalDisconnected'),
                        terminalFailed: translations('terminalFailed'),
                        title: translations('containerControl'),
                        unpause: translations('unpause'),
                    }}
                />
            </main>
            <aside className="hidden bg-card p-3 lg:block">
                <p className="text-xs text-muted-foreground">M1 Max · Docker Desktop</p>
                <p className="mt-6 text-sm font-medium">{authGate.session.user.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{authGate.session.role}</p>
                <LogoutButton label={authTranslations('logout')} />
            </aside>
        </div>
    )
}

export default DashboardPage
