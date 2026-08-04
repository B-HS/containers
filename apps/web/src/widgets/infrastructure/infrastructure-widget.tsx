'use client'

import type { FC } from 'react'
import { useGetInfrastructure } from '@entities/infrastructure/infrastructure.query'
import { Tabs, TabsList, TabsTrigger } from '@shared/ui/tabs'
import { WidgetSection } from '@shared/common/widget-section'
import type { InfrastructureLabels } from './infrastructure-labels'
import { NetworkTab } from './network-tab'
import { VolumeTab } from './volume-tab'

type InfrastructureWidgetProps = {
    labels: InfrastructureLabels
    role: string
}

const MANAGE_ROLES = ['owner', 'admin']

export const InfrastructureWidget: FC<InfrastructureWidgetProps> = ({ labels, role }) => {
    const { data, isPending } = useGetInfrastructure()
    const networks = data?.networks ?? []
    const volumes = data?.volumes ?? []
    const canManage = MANAGE_ROLES.includes(role)

    return (
        <WidgetSection id="infrastructure-control-title" title={labels.title} badge={networks.length + volumes.length}>
            <Tabs defaultValue="networks">
                <TabsList className="m-4">
                    <TabsTrigger value="networks">{labels.networks}</TabsTrigger>
                    <TabsTrigger value="volumes">{labels.volumes}</TabsTrigger>
                </TabsList>
                <NetworkTab canManage={canManage} isPending={isPending} labels={labels} networks={networks} />
                <VolumeTab canManage={canManage} isPending={isPending} labels={labels} volumes={volumes} />
            </Tabs>
        </WidgetSection>
    )
}
