'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { VolumeSummary } from '@containers/contracts/engine-control'
import { useCreateVolume, useRemoveVolume } from '@entities/infrastructure/infrastructure.query'
import { VolumeCreateForm } from '@features/infrastructure/volume-create-form'
import { VolumeDetailCard } from '@features/infrastructure/volume-detail-card'
import { formatBytes } from '@shared/lib/format-bytes'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { TabsContent } from '@shared/ui/tabs'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import type { InfrastructureLabels } from './infrastructure-labels'

type VolumeTabProps = {
    canManage: boolean
    isPending: boolean
    labels: InfrastructureLabels
    volumes: VolumeSummary[]
}

const SKELETON_ROW_COUNT = 4

export const VolumeTab: FC<VolumeTabProps> = ({ canManage, isPending, labels, volumes }) => {
    const [busy, setBusy] = useState<string>()
    const volumesWithId = volumes.map((volume) => ({ ...volume, id: volume.name }))
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(volumesWithId)
    const createVolume = useCreateVolume()
    const removeVolume = useRemoveVolume()

    const create = async (name: string) => {
        setBusy('create')
        try {
            await createVolume.mutateAsync(name)
            toast.success(labels.created)
        } catch {
            toast.error(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (volumeName: string, confirmation: string, force: boolean) => {
        setBusy(volumeName)
        try {
            await removeVolume.mutateAsync({ volumeName, confirmation, force })
            toast.success(labels.removed)
        } catch {
            toast.error(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <TabsContent value="volumes">
            {canManage && <VolumeCreateForm busy={busy === 'create'} labels={labels} onCreate={(name) => void create(name)} />}
            {isPending && (
                <div className="grid gap-px bg-background p-px">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index).map((index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            )}
            {!isPending && volumes.length === 0 && (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.volumesEmptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {!isPending && volumes.length > 0 && (
                <MasterDetail
                    empty={null}
                    items={volumes.map((volume) => ({
                        badge: volume.driver,
                        id: volume.name,
                        subtitle: formatBytes(volume.sizeBytes),
                        title: volume.name,
                    }))}
                    listLabel={labels.volumes}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    {selectedItem && (
                        <VolumeDetailCard
                            busy={busy === selectedItem.name}
                            canRemove={canManage}
                            labels={labels}
                            onRemove={remove}
                            volume={selectedItem}
                        />
                    )}
                </MasterDetail>
            )}
        </TabsContent>
    )
}
