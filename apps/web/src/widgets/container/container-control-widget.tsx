'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import {
    useCreateExecTicket,
    useExecuteContainerCommand,
    useGetContainerDetail,
    useGetContainerList,
    useGetContainerLog,
    usePerformContainerAction,
    useRemoveContainer,
} from '@entities/engine/engine.query'
import { Button } from '@shared/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import { Link } from '../../i18n/navigation'
import { CONTAINER_ACTION_TIMEOUT_SECONDS, CONTAINER_ACTIONS, CONTAINER_STOP_ACTIONS, type ContainerActionName } from './container-actions'
import { ContainerDetailCard } from './container-detail-card'

const OPERATOR_ROLES = ['owner', 'admin', 'operator']
const REMOVE_ROLES = ['owner', 'admin']
const SKELETON_ROWS = [0, 1, 2]

const createSocket = (websocketPath: string) =>
    new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${websocketPath}`)

const createLogStream = (containerId: string) => new EventSource(`/api/stream/containers/${encodeURIComponent(containerId)}/logs?tail=100`)

type ContainerControlWidgetProps = {
    role: string
}

export const ContainerControlWidget: FC<ContainerControlWidgetProps> = ({ role }) => {
    const [execOutput, setExecOutput] = useState<Record<string, string>>({})
    const [inspectId, setInspectId] = useState('')
    const t = useTranslations('Dashboard')
    const containerList = useGetContainerList()
    const containers = containerList.data ?? []
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(containers)
    const canOperate = OPERATOR_ROLES.includes(role)
    const canRemove = REMOVE_ROLES.includes(role)
    const canExec = role === 'owner'
    const performAction = usePerformContainerAction()
    const executeCommand = useExecuteContainerCommand()
    const removeContainer = useRemoveContainer()
    const createExecTicket = useCreateExecTicket()
    const inspectDetail = useGetContainerDetail(inspectId)
    const inspectLog = useGetContainerLog(inspectId)
    const isInspecting = inspectId.length > 0 && (inspectDetail.isPending || inspectLog.isPending)
    const inspectOutput =
        inspectDetail.data && inspectLog.data
            ? `${JSON.stringify(inspectDetail.data, null, 2)}\n\n[stdout]\n${inspectLog.data.stdout}\n[stderr]\n${inspectLog.data.stderr}`
            : undefined
    const pendingAction = CONTAINER_ACTIONS.find(
        (action) => performAction.isPending && performAction.variables?.containerId === selectedId && performAction.variables.action === action,
    )

    const runAction = (containerId: string, action: ContainerActionName) => {
        performAction.mutate(
            {
                containerId,
                action,
                ...(CONTAINER_STOP_ACTIONS.includes(action) ? { timeoutSeconds: CONTAINER_ACTION_TIMEOUT_SECONDS } : {}),
            },
            {
                onError: () => toast.error(t('actionFailed')),
                onSuccess: () => toast.success(t('containerActionSucceeded')),
            },
        )
    }

    const runExec = (containerId: string, commandText: string) => {
        const command = commandText
            .split('\n')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
        executeCommand.mutate(
            { containerId, command },
            {
                onError: () => toast.error(t('actionFailed')),
                onSuccess: (result) => setExecOutput((current) => ({ ...current, [containerId]: `${result.stdout}${result.stderr}` })),
            },
        )
    }

    const runRemove = (containerId: string, input: { confirmation: string; force: boolean }) => {
        removeContainer.mutate(
            { containerId, ...input },
            {
                onError: () => toast.error(t('actionFailed')),
                onSuccess: () => toast.success(t('containerRemoved')),
            },
        )
    }

    return (
        <WidgetSection id="container-control-title" title={t('containerControl')} badge={containers.length}>
            {containerList.isPending ? (
                <div className="grid gap-2 p-4">
                    {SKELETON_ROWS.map((row) => (
                        <Skeleton key={row} className="h-12 w-full" />
                    ))}
                </div>
            ) : (
                <MasterDetail
                    empty={
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Boxes aria-hidden="true" />
                                </EmptyMedia>
                                <EmptyTitle>{t('empty')}</EmptyTitle>
                                <EmptyDescription>{t('containerEmptyDescription')}</EmptyDescription>
                            </EmptyHeader>
                            {canRemove ? (
                                <EmptyContent>
                                    <Button asChild size="sm">
                                        <Link href="/containers/new">{t('containerCreate')}</Link>
                                    </Button>
                                </EmptyContent>
                            ) : null}
                        </Empty>
                    }
                    items={containers.map((container) => ({
                        badge: container.state,
                        id: container.id,
                        subtitle: container.image,
                        title: container.names[0] ?? container.id.slice(0, 12),
                    }))}
                    listLabel={t('container')}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    {selectedItem ? (
                        <ContainerDetailCard
                            canExec={canExec}
                            canOperate={canOperate}
                            canRemove={canRemove}
                            container={selectedItem}
                            createExecTicket={createExecTicket.mutateAsync}
                            createLogStream={createLogStream}
                            createSocket={createSocket}
                            execOutput={execOutput[selectedItem.id]}
                            inspectOutput={inspectId === selectedItem.id ? inspectOutput : undefined}
                            isExecuting={executeCommand.isPending}
                            isInspecting={isInspecting && inspectId === selectedItem.id}
                            isRemoving={removeContainer.isPending}
                            onExecute={(commandText) => runExec(selectedItem.id, commandText)}
                            onInspect={() => setInspectId(selectedItem.id)}
                            onPerformAction={(action) => runAction(selectedItem.id, action)}
                            onRemove={(input) => runRemove(selectedItem.id, input)}
                            pendingAction={pendingAction}
                        />
                    ) : null}
                </MasterDetail>
            )}
        </WidgetSection>
    )
}
