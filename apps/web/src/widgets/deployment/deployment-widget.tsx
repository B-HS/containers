'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { DeploymentManifestInput } from '@containers/contracts/deployment'
import { deploymentFailureDiagnosticsSchema } from '@containers/contracts/deployment'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import {
    useCreateDeploymentManifest,
    useCreateDeploymentRelease,
    useGetDeploymentManifests,
    useGetDeploymentReleases,
    useRollbackDeploymentRelease,
} from '@entities/deployment/deployment.query'
import { useGetImages } from '@entities/image/image.query'
import { useGetInfrastructure } from '@entities/infrastructure/infrastructure.query'
import { useGetJobEvents, useGetJobsByKind } from '@entities/job/job.query'
import { ConfirmActionDialog } from '@features/confirm-action-dialog/confirm-action-dialog'
import { DeploymentFailureDetail } from '@features/deployment-failure-detail/deployment-failure-detail'
import { DeploymentManifestForm } from '@features/deployment-manifest-form/deployment-manifest-form'
import { DeploymentReleaseProgress } from '@features/deployment-release-progress/deployment-release-progress'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

const ACTIVE_RELEASE_STATUSES: string[] = ['creating', 'observing', 'probing', 'rolling-back', 'switching']
const FAILED_RELEASE_STATUSES: string[] = ['failed', 'rolled-back']
const JOB_VIEWER_ROLES = ['owner', 'admin']

type DeploymentWidgetProps = {
    role: string
}

export const DeploymentWidget: FC<DeploymentWidgetProps> = ({ role }) => {
    const t = useTranslations('Dashboard')
    const manifestsQuery = useGetDeploymentManifests()
    const releasesQuery = useGetDeploymentReleases(true)
    const manifests = manifestsQuery.data ?? []
    const releases = releasesQuery.data ?? []
    const images = useGetImages().data ?? []
    const networks = useGetInfrastructure().data?.networks ?? []
    const createManifest = useCreateDeploymentManifest()
    const createRelease = useCreateDeploymentRelease()
    const rollbackRelease = useRollbackDeploymentRelease()
    const { onSelect, selectedId, selectedItem: selectedManifest } = useMasterDetailSelection(manifests)
    const canManage = JOB_VIEWER_ROLES.includes(role)
    const selectedRelease = releases.find((release) => release.manifestId === selectedManifest?.id)
    const releaseFailed = selectedRelease !== undefined && FAILED_RELEASE_STATUSES.includes(selectedRelease.status)
    const releaseJobs = useGetJobsByKind(OPERATION_JOB_KIND.DEPLOY_RELEASE, canManage && releaseFailed).data ?? []
    const releaseJob = releaseJobs.find((job) => job.payload.releaseId === selectedRelease?.id)
    const releaseJobEvents = useGetJobEvents(releaseJob?.id ?? '', canManage && releaseFailed).data ?? []
    const diagnostics = releaseJobEvents
        .map((event) => deploymentFailureDiagnosticsSchema.safeParse(event.detail))
        .findLast((parsed) => parsed.success)?.data
    const hasActiveDeployment = releases.some(
        (release) =>
            ACTIVE_RELEASE_STATUSES.includes(release.status) &&
            manifests.find((manifest) => manifest.id === release.manifestId)?.name === selectedManifest?.name,
    )

    const submitManifest = (input: DeploymentManifestInput) => {
        createManifest.mutate(input, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentFailed')),
            onSuccess: () => toast.success(t('deploymentManifestCreated')),
        })
    }

    const deploy = (manifestId: string) => {
        createRelease.mutate(manifestId, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentFailed')),
            onSuccess: () => toast.success(t('deploymentReleaseStarted')),
        })
    }

    const rollback = (releaseId: string) => {
        rollbackRelease.mutate(releaseId, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentFailed')),
            onSuccess: () => toast.success(t('deploymentRollbackStarted')),
        })
    }

    return (
        <WidgetSection
            id="deployment-control-title"
            title={t('deploymentControl')}
            notice={canManage ? t('deploymentRecentAuth') : undefined}
            badge={manifests.length}
        >
            {canManage ? (
                <DeploymentManifestForm images={images} networks={networks} onSubmit={submitManifest} pending={createManifest.isPending} />
            ) : null}
            {manifestsQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-2/3" />
                </div>
            ) : null}
            {!manifestsQuery.isPending && manifests.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('deploymentEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('deploymentEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {selectedManifest ? (
                <MasterDetail
                    empty={null}
                    items={manifests.map((manifest) => ({
                        id: manifest.id,
                        subtitle:
                            manifest.route === null
                                ? `${t('deploymentInternalService')} → :${manifest.internalPort}`
                                : `${manifest.route.hostname}${manifest.route.path} → :${manifest.internalPort}`,
                        title: `${manifest.name} · ${manifest.version}`,
                    }))}
                    listLabel={t('deploymentManifest')}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-4 p-4">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold text-text-strong">
                                    {selectedManifest.name} · {selectedManifest.version}
                                </h3>
                                <p className="truncate text-xs text-text-muted">
                                    {selectedManifest.route === null
                                        ? t('deploymentInternalService')
                                        : `${selectedManifest.route.hostname}${selectedManifest.route.path}`}{' '}
                                    → :{selectedManifest.internalPort}
                                </p>
                            </div>
                            <Badge variant="neutral">{t('deploymentManifest')}</Badge>
                        </div>
                        <p className="truncate font-mono text-xs text-text-subtle">{selectedManifest.imageDigest}</p>
                        {selectedRelease ? <DeploymentReleaseProgress release={selectedRelease} /> : null}
                        {releaseFailed && selectedRelease ? (
                            <DeploymentFailureDetail diagnostics={diagnostics} failureCode={selectedRelease.failureCode} />
                        ) : null}
                        {canManage ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    disabled={createRelease.isPending || hasActiveDeployment}
                                    onClick={() => deploy(selectedManifest.id)}
                                >
                                    {createRelease.isPending ? t('deploymentReleaseStarting') : t('deploymentReleaseStart')}
                                </Button>
                                {selectedRelease?.status === 'healthy' && selectedRelease.previousReleaseId ? (
                                    <ConfirmActionDialog
                                        confirmLabel={t('deploymentRollback')}
                                        description={t('deploymentRollbackDescription')}
                                        impact={`${selectedManifest.name} · ${selectedManifest.version}`}
                                        onConfirm={() => rollback(selectedRelease.id)}
                                        pending={rollbackRelease.isPending}
                                        target={selectedRelease.id}
                                        title={t('deploymentRollbackTitle')}
                                        trigger={
                                            <Button type="button" variant="destructive" disabled={rollbackRelease.isPending || hasActiveDeployment}>
                                                {rollbackRelease.isPending ? t('deploymentRollingBack') : t('deploymentRollback')}
                                            </Button>
                                        }
                                    />
                                ) : null}
                                {hasActiveDeployment ? <p className="text-xs text-text-subtle">{t('deploymentActiveReleaseNotice')}</p> : null}
                            </div>
                        ) : null}
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
