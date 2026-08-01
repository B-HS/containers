import { imagePullRequestSchema } from '@containers/contracts/engine-control'
import {
    backupRestoreJobPayloadSchema,
    OPERATION_JOB_KIND,
    systemPruneJobPayloadSchema,
    trafficExportJobPayloadSchema,
} from '@containers/contracts/operation-job'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import type { BackupService } from '../backup/create-backup-service'
import type { MaintenanceService } from '../maintenance/create-maintenance-service'
import type { OperationJobHandler } from './create-operation-job-service'
import { createAppError } from '../../../lib/app-error'
import type { TrafficWorkerClient } from '../../../traffic/create-traffic-worker-client'

const RESTORE_DRAIN_TIMEOUT_MS = 10_000
const RESTORE_MAINTENANCE_REASON = 'backup-restore'

type JobHandlersDependencies = {
    backupService: Pick<BackupService, 'create' | 'restore'>
    engineAgentClient: Pick<
        EngineAgentClient,
        'getPrunePreview' | 'performContainerAction' | 'pruneBuildCache' | 'pullImage' | 'removeImage' | 'removeNetwork' | 'removeVolume'
    >
    maintenanceService: Pick<MaintenanceService, 'disable' | 'drain' | 'enable'>
    trafficWorkerClient?: Pick<TrafficWorkerClient, 'createExport'>
}

export const createJobHandlers = ({ backupService, engineAgentClient, maintenanceService, trafficWorkerClient }: JobHandlersDependencies) => {
    const handleBackupCreate: OperationJobHandler = async ({ job, reportProgress }) => {
        await reportProgress('snapshot')
        const manifest = await backupService.create(job.payload)
        return { backupId: manifest.id, controlBytes: manifest.controlBytes, trafficBytes: manifest.trafficBytes }
    }

    const handleBackupRestore: OperationJobHandler = async ({ job, reportProgress }) => {
        const payload = backupRestoreJobPayloadSchema.parse(job.payload)
        const enabledByJob = maintenanceService.enable(RESTORE_MAINTENANCE_REASON)
        try {
            await reportProgress('drain')
            await maintenanceService.drain(RESTORE_DRAIN_TIMEOUT_MS)
            await reportProgress('restore')
            const result = await backupService.restore(payload.backupId, { confirmation: payload.confirmation })
            return { backupId: payload.backupId, recoveryBackupId: result.recoveryBackupId, restored: true }
        } finally {
            if (enabledByJob) {
                maintenanceService.disable()
            }
        }
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

    return {
        [OPERATION_JOB_KIND.BACKUP_CREATE]: handleBackupCreate,
        [OPERATION_JOB_KIND.BACKUP_RESTORE]: handleBackupRestore,
        [OPERATION_JOB_KIND.IMAGE_PULL]: handleImagePull,
        [OPERATION_JOB_KIND.SYSTEM_PRUNE]: handleSystemPrune,
        [OPERATION_JOB_KIND.TRAFFIC_EXPORT]: handleTrafficExport,
    }
}
