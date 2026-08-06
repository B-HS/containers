import { imagePullRequestSchema } from '@containers/contracts/engine-control'
import {
    backupRestoreJobPayloadSchema,
    deployLoadJobPayloadSchema,
    deployReleaseJobPayloadSchema,
    deployRollbackJobPayloadSchema,
    deployStackReleaseJobPayloadSchema,
    OPERATION_JOB_KIND,
    secretRotateJobPayloadSchema,
    systemPruneJobPayloadSchema,
    trafficExportJobPayloadSchema,
    uploadFinalizeJobPayloadSchema,
} from '@containers/contracts/operation-job'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import type { BackupService } from '../backup/create-backup-service'
import type { DeploymentReleaseService } from '../deployment/create-deployment-release-service'
import type { DeploymentService } from '../deployment/create-deployment-service'
import type { DeploymentStackReleaseService } from '../deployment/create-deployment-stack-release-service'
import type { MaintenanceService } from '../maintenance/create-maintenance-service'
import type { NotificationDeliveryService } from '../notification/create-notification-delivery-service'
import type { SecretRotationService } from '../deployment/create-secret-rotation-service'
import type { OperationJobHandler } from './create-operation-job-service'
import { createAppError } from '../../../lib/error'
import type { TrafficWorkerClient } from '../../../service/shared/traffic-worker-client/create-traffic-worker-client'
import type { UploadService } from '../upload/create-upload-service'
import { createJobError } from './create-operation-job-service'

const RESTORE_DRAIN_TIMEOUT_MS = 10_000
const RESTORE_MAINTENANCE_REASON = 'backup-restore'

const UPLOAD_FINALIZE_TERMINAL_CODES = new Set(['ARTIFACT_DIGEST_MISMATCH', 'UPLOAD_INCOMPLETE', 'UPLOAD_SESSION_INVALID'])

type JobHandlersDependencies = {
    backupService: Pick<BackupService, 'create' | 'restore'>
    deploymentReleaseService: Pick<DeploymentReleaseService, 'run' | 'runRollback'>
    deploymentService: Pick<DeploymentService, 'loadArtifact'>
    deploymentStackReleaseService: Pick<DeploymentStackReleaseService, 'run'>
    engineAgentClient: Pick<
        EngineAgentClient,
        'getPrunePreview' | 'performContainerAction' | 'pruneBuildCache' | 'pullImage' | 'removeImage' | 'removeNetwork' | 'removeVolume'
    >
    maintenanceService: Pick<MaintenanceService, 'disable' | 'drain' | 'enable'>
    notificationDeliveryService: Pick<NotificationDeliveryService, 'handleDeliver'>
    secretRotationService: Pick<SecretRotationService, 'rotate'>
    trafficWorkerClient?: Pick<TrafficWorkerClient, 'createExport'>
    uploadService: Pick<UploadService, 'finalizeSession'>
}

export const createJobHandlers = ({
    backupService,
    deploymentReleaseService,
    deploymentService,
    deploymentStackReleaseService,
    engineAgentClient,
    maintenanceService,
    notificationDeliveryService,
    secretRotationService,
    trafficWorkerClient,
    uploadService,
}: JobHandlersDependencies) => {
    const handleBackupCreate: OperationJobHandler = async ({ job, reportProgress }) => {
        await reportProgress('snapshot')
        const manifest = await backupService.create(job.payload)
        return { backupId: manifest.id, controlBytes: manifest.controlBytes, trafficBytes: manifest.trafficBytes }
    }

    const handleBackupRestore: OperationJobHandler = async ({ job, reportProgress }) => {
        const payload = backupRestoreJobPayloadSchema.parse(job.payload)
        const enabledByJob = maintenanceService.enable(RESTORE_MAINTENANCE_REASON, { actorId: job.createdBy, jobId: job.id })
        try {
            await reportProgress('drain')
            await maintenanceService.drain(RESTORE_DRAIN_TIMEOUT_MS)
            await reportProgress('restore')
            const result = await backupService.restore(payload.backupId, { confirmation: payload.confirmation, mode: payload.mode })
            return {
                backupId: payload.backupId,
                mode: result.mode,
                recoveryBackupId: result.recoveryBackupId,
                restored: true,
                secretsRestored: result.secretsRestored,
            }
        } finally {
            if (enabledByJob) {
                maintenanceService.disable()
            }
        }
    }

    const handleDeployLoad: OperationJobHandler = async ({ job }) => {
        const payload = deployLoadJobPayloadSchema.parse(job.payload)
        if (job.createdBy === null) {
            throw createJobError('JOB_ACTOR_MISSING', { terminal: true })
        }
        const deployment = await deploymentService.loadArtifact(payload.artifactId, job.createdBy)
        return { deploymentId: deployment.id, messages: deployment.messages }
    }

    const handleDeployRelease: OperationJobHandler = async ({ job, reportProgress }) => {
        const payload = deployReleaseJobPayloadSchema.parse(job.payload)
        const release = await deploymentReleaseService.run(payload.releaseId, {
            reportDiagnostics: (diagnostics) => reportProgress(diagnostics.step, { ...diagnostics }),
        })
        if (release.status !== 'healthy') {
            throw createJobError(release.failureCode ?? 'DEPLOYMENT_RELEASE_FAILED', { terminal: true })
        }
        return { releaseId: release.id, status: release.status }
    }

    const handleDeployRollback: OperationJobHandler = async ({ job }) => {
        const payload = deployRollbackJobPayloadSchema.parse(job.payload)
        const release = await deploymentReleaseService.runRollback(payload.releaseId)
        if (release.status !== 'rolled-back') {
            throw createJobError(release.failureCode ?? 'DEPLOYMENT_ROLLBACK_FAILED', { terminal: true })
        }
        return { releaseId: release.id, status: release.status }
    }

    const handleDeployStackRelease: OperationJobHandler = async ({ job, reportProgress }) => {
        const payload = deployStackReleaseJobPayloadSchema.parse(job.payload)
        const stackRelease = await deploymentStackReleaseService.run(payload.stackReleaseId, {
            reportDiagnostics: (diagnostics) => reportProgress(diagnostics.step, { ...diagnostics }),
        })
        if (stackRelease.status !== 'healthy') {
            throw createJobError(stackRelease.failureCode ?? 'DEPLOYMENT_STACK_RELEASE_FAILED', { terminal: true })
        }
        return { releaseIds: stackRelease.releaseIds, stackReleaseId: stackRelease.id, status: stackRelease.status }
    }

    const handleImagePull: OperationJobHandler = async ({ job, reportProgress }) => {
        const payload = imagePullRequestSchema.parse(job.payload)
        await reportProgress('pull', { reference: payload.reference })
        const result = await engineAgentClient.pullImage(payload)
        return { messages: result.messages, reference: result.reference }
    }

    const handleSystemPrune: OperationJobHandler = async ({ isCancelRequested, job, reportProgress }) => {
        const payload = systemPruneJobPayloadSchema.parse(job.payload)
        const preview = await engineAgentClient.getPrunePreview({ includeVolumes: payload.includeVolumes })
        if (preview.sha256 !== payload.previewSha256) {
            throw createAppError('PRUNE_PREVIEW_STALE')
        }
        const ensureNotCancelled = async () => {
            if (await isCancelRequested()) {
                throw createAppError('JOB_CANCELLED')
            }
        }

        await reportProgress('containers', { count: preview.containers.length })
        for (const candidate of preview.containers) {
            await ensureNotCancelled()
            await engineAgentClient.performContainerAction(candidate.id, {
                action: 'remove',
                confirmation: candidate.id,
                force: false,
                removeVolumes: false,
            })
        }
        await reportProgress('images', { count: preview.images.length })
        for (const candidate of preview.images) {
            await ensureNotCancelled()
            await engineAgentClient.removeImage(candidate.id, {
                confirmation: candidate.id.replace(/^sha256:/, ''),
                force: false,
                pruneChildren: false,
            })
        }
        await reportProgress('networks', { count: preview.networks.length })
        for (const candidate of preview.networks) {
            await ensureNotCancelled()
            if (candidate.name === null) {
                throw createAppError('PRUNE_PREVIEW_INVALID')
            }
            await engineAgentClient.removeNetwork(candidate.id, { confirmation: candidate.name, force: false })
        }
        await reportProgress('volumes', { count: preview.volumes.length })
        for (const candidate of preview.volumes) {
            await ensureNotCancelled()
            if (candidate.name === null) {
                throw createAppError('PRUNE_PREVIEW_INVALID')
            }
            await engineAgentClient.removeVolume(candidate.id, { confirmation: candidate.name, force: false })
        }
        await reportProgress('build-cache', { count: preview.buildCache.length })
        await ensureNotCancelled()
        const buildCacheResult =
            preview.buildCache.length === 0
                ? { deletedIds: [], spaceReclaimed: 0 }
                : await engineAgentClient.pruneBuildCache({ ids: preview.buildCache.map((candidate) => candidate.id) })

        return {
            buildCacheDeleted: buildCacheResult.deletedIds.length,
            containersDeleted: preview.containers.length,
            estimatedReclaimableBytes: preview.reclaimableBytes,
            imagesDeleted: preview.images.length,
            networksDeleted: preview.networks.length,
            reclaimedBuildCacheBytes: buildCacheResult.spaceReclaimed,
            volumesDeleted: preview.volumes.length,
        }
    }

    const handleTrafficExport: OperationJobHandler = async ({ isCancelRequested, job, reportProgress }) => {
        const payload = trafficExportJobPayloadSchema.parse(job.payload)
        if (!trafficWorkerClient) throw createAppError('TRAFFIC_EXPORT_UNAVAILABLE')
        if (await isCancelRequested()) throw createAppError('JOB_CANCELLED')
        await reportProgress('export', { format: payload.format, from: payload.from, to: payload.to })
        const result = await trafficWorkerClient.createExport(job.id, payload)
        if (await isCancelRequested()) throw createAppError('JOB_CANCELLED')
        return result
    }

    const handleUploadFinalize: OperationJobHandler = async ({ job }) => {
        const payload = uploadFinalizeJobPayloadSchema.parse(job.payload)
        if (job.createdBy === null) {
            throw createJobError('JOB_ACTOR_MISSING', { terminal: true })
        }
        try {
            const artifact = await uploadService.finalizeSession(job.createdBy, payload.sessionId)
            return { artifactId: artifact.id }
        } catch (error) {
            const code = error instanceof Error ? error.message : 'UPLOAD_FINALIZE_FAILED'
            if (UPLOAD_FINALIZE_TERMINAL_CODES.has(code)) {
                throw createJobError(code, { terminal: true })
            }
            throw error
        }
    }

    const handleSecretRotate: OperationJobHandler = async ({ job }) => {
        secretRotateJobPayloadSchema.parse(job.payload)
        return secretRotationService.rotate()
    }

    return {
        [OPERATION_JOB_KIND.BACKUP_CREATE]: handleBackupCreate,
        [OPERATION_JOB_KIND.BACKUP_RESTORE]: handleBackupRestore,
        [OPERATION_JOB_KIND.DEPLOY_LOAD]: handleDeployLoad,
        [OPERATION_JOB_KIND.DEPLOY_RELEASE]: handleDeployRelease,
        [OPERATION_JOB_KIND.DEPLOY_ROLLBACK]: handleDeployRollback,
        [OPERATION_JOB_KIND.DEPLOY_STACK_RELEASE]: handleDeployStackRelease,
        [OPERATION_JOB_KIND.IMAGE_PULL]: handleImagePull,
        [OPERATION_JOB_KIND.NOTIFICATION_DELIVER]: notificationDeliveryService.handleDeliver,
        [OPERATION_JOB_KIND.SECRET_ROTATE]: handleSecretRotate,
        [OPERATION_JOB_KIND.SYSTEM_PRUNE]: handleSystemPrune,
        [OPERATION_JOB_KIND.TRAFFIC_EXPORT]: handleTrafficExport,
        [OPERATION_JOB_KIND.UPLOAD_FINALIZE]: handleUploadFinalize,
    }
}
