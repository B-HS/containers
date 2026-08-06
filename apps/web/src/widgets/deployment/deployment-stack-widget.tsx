'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { DEPLOYMENT_STACK_RELEASE_STATUS, type ComposeStackInput, type ComposeStackPreview } from '@containers/contracts/deployment-stack'
import {
    useCreateDeploymentStack,
    useCreateDeploymentStackRelease,
    useGetDeploymentStackReleases,
    useGetDeploymentStacks,
    usePreviewDeploymentStack,
} from '@entities/deployment/deployment-stack.query'
import { DeploymentStackForm } from '@features/deployment-stack-form/deployment-stack-form'
import { DeploymentStackPreview } from '@features/deployment-stack-preview/deployment-stack-preview'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

const STACK_MANAGER_ROLES = ['owner', 'admin']

const RELEASE_STATUS_VARIANT = {
    [DEPLOYMENT_STACK_RELEASE_STATUS.FAILED]: 'danger',
    [DEPLOYMENT_STACK_RELEASE_STATUS.HEALTHY]: 'success',
    [DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING]: 'attention',
    [DEPLOYMENT_STACK_RELEASE_STATUS.ROLLED_BACK]: 'neutral',
} as const

const RELEASE_STATUS_LABEL = {
    [DEPLOYMENT_STACK_RELEASE_STATUS.FAILED]: 'deploymentStackStatusFailed',
    [DEPLOYMENT_STACK_RELEASE_STATUS.HEALTHY]: 'deploymentStackStatusHealthy',
    [DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING]: 'deploymentStackStatusReleasing',
    [DEPLOYMENT_STACK_RELEASE_STATUS.ROLLED_BACK]: 'deploymentStackStatusRolledBack',
} as const

type DeploymentStackWidgetProps = {
    role: string
}

export const DeploymentStackWidget: FC<DeploymentStackWidgetProps> = ({ role }) => {
    const [preview, setPreview] = useState<ComposeStackPreview | null>(null)
    const t = useTranslations('Dashboard')
    const stacksQuery = useGetDeploymentStacks()
    const stacks = stacksQuery.data ?? []
    const releases = useGetDeploymentStackReleases(true).data ?? []
    const previewStack = usePreviewDeploymentStack()
    const createStack = useCreateDeploymentStack()
    const createRelease = useCreateDeploymentStackRelease()
    const { onSelect, selectedId, selectedItem: selectedStack } = useMasterDetailSelection(stacks)
    const canManage = STACK_MANAGER_ROLES.includes(role)
    const stackReleases = releases.filter((release) => release.stackId === selectedStack?.id)
    const latestRelease = stackReleases[stackReleases.length - 1]
    const releasing = latestRelease?.status === DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING

    const runPreview = (input: ComposeStackInput) => {
        previewStack.mutate(input, {
            onError: (error) => {
                setPreview(null)
                toast.error(error instanceof Error ? error.message : t('deploymentStackFailed'))
            },
            onSuccess: (result) => setPreview(result),
        })
    }

    const submitStack = (input: ComposeStackInput) => {
        createStack.mutate(input, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentStackFailed')),
            onSuccess: () => toast.success(t('deploymentStackCreated')),
        })
    }

    const deployStack = (stackId: string) => {
        createRelease.mutate(stackId, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentStackFailed')),
            onSuccess: () => toast.success(t('deploymentStackReleaseStarted')),
        })
    }

    return (
        <WidgetSection
            id="deployment-stack-title"
            title={t('deploymentStackControl')}
            notice={canManage ? t('deploymentRecentAuth') : undefined}
            badge={stacks.length}
        >
            {canManage ? (
                <DeploymentStackForm
                    onPreview={runPreview}
                    onSubmit={submitStack}
                    pending={createStack.isPending}
                    previewing={previewStack.isPending}
                />
            ) : null}
            {preview ? <DeploymentStackPreview preview={preview} /> : null}
            {stacksQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-2/3" />
                </div>
            ) : null}
            {!stacksQuery.isPending && stacks.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('deploymentStackEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('deploymentStackEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {selectedStack ? (
                <MasterDetail
                    empty={null}
                    items={stacks.map((stack) => ({
                        id: stack.id,
                        subtitle: stack.serviceOrder.join(' → '),
                        title: `${stack.name} · ${stack.version}`,
                    }))}
                    listLabel={t('deploymentStackControl')}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-4 p-4">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold text-text-strong">
                                    {selectedStack.name} · {selectedStack.version}
                                </h3>
                                <p className="truncate text-xs text-text-muted">{selectedStack.serviceOrder.join(' → ')}</p>
                            </div>
                            {latestRelease ? (
                                <Badge variant={RELEASE_STATUS_VARIANT[latestRelease.status]}>{t(RELEASE_STATUS_LABEL[latestRelease.status])}</Badge>
                            ) : (
                                <Badge variant="neutral">{t('deploymentStackNeverReleased')}</Badge>
                            )}
                        </div>
                        {latestRelease?.failureCode ? (
                            <p className="bg-surface-3 px-3 py-2 font-mono text-xs break-all text-danger">{latestRelease.failureCode}</p>
                        ) : null}
                        <p className="text-xs text-text-subtle">
                            {t('deploymentStackServiceCount', { count: selectedStack.manifestIds.length })}
                            {latestRelease ? ` · ${t('deploymentStackReleaseCount', { count: latestRelease.releaseIds.length })}` : ''}
                        </p>
                        {canManage ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button disabled={createRelease.isPending || releasing} onClick={() => deployStack(selectedStack.id)} type="button">
                                    {createRelease.isPending ? t('deploymentStackReleaseStarting') : t('deploymentStackReleaseStart')}
                                </Button>
                                {releasing ? <p className="text-xs text-text-subtle">{t('deploymentStackActiveReleaseNotice')}</p> : null}
                            </div>
                        ) : null}
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
