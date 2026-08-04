'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { NetworkSummary } from '@containers/contracts/engine-control'
import { useCreateNetwork, useRemoveNetwork } from '@entities/infrastructure/infrastructure.query'
import { NetworkCreateForm } from '@features/infrastructure/network-create-form'
import { NetworkDetailCard } from '@features/infrastructure/network-detail-card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { TabsContent } from '@shared/ui/tabs'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import type { InfrastructureLabels } from './infrastructure-labels'

type NetworkTabProps = {
    canManage: boolean
    isPending: boolean
    labels: InfrastructureLabels
    networks: NetworkSummary[]
}

const SKELETON_ROW_COUNT = 4

export const NetworkTab: FC<NetworkTabProps> = ({ canManage, isPending, labels, networks }) => {
    const [busy, setBusy] = useState<string>()
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(networks)
    const createNetwork = useCreateNetwork()
    const removeNetwork = useRemoveNetwork()

    const create = async (input: { gateway: string; internal: boolean; name: string; subnet: string }) => {
        setBusy('create')
        try {
            await createNetwork.mutateAsync({
                attachable: false,
                internal: input.internal,
                name: input.name,
                ...(input.gateway ? { gateway: input.gateway } : {}),
                ...(input.subnet ? { subnet: input.subnet } : {}),
            })
            toast.success(labels.created)
        } catch {
            toast.error(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (networkId: string, confirmation: string) => {
        setBusy(networkId)
        try {
            await removeNetwork.mutateAsync({ networkId, confirmation })
            toast.success(labels.removed)
        } catch {
            toast.error(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <TabsContent value="networks">
            {canManage && <NetworkCreateForm busy={busy === 'create'} labels={labels} onCreate={(input) => void create(input)} />}
            {isPending && (
                <div className="grid gap-px bg-background p-px">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index).map((index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            )}
            {!isPending && networks.length === 0 && (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.networksEmptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {!isPending && networks.length > 0 && (
                <MasterDetail
                    empty={null}
                    items={networks.map((network) => ({
                        badge: network.driver,
                        id: network.id,
                        subtitle: network.id.slice(0, 12),
                        title: network.name,
                    }))}
                    listLabel={labels.networks}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    {selectedItem && (
                        <NetworkDetailCard
                            busy={busy === selectedItem.id}
                            canRemove={canManage}
                            labels={labels}
                            network={selectedItem}
                            onRemove={remove}
                        />
                    )}
                </MasterDetail>
            )}
        </TabsContent>
    )
}
