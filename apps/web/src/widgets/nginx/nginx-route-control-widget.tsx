'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { useCreateNginxRoute, useGetNginxRoutes, useRemoveNginxRoute } from '@entities/nginx/nginx.query'
import { NginxRouteCreateForm } from '@features/nginx/nginx-route-create-form'
import { NginxRouteTable } from '@features/nginx/nginx-route-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'
import type { NginxRouteLabels } from './nginx-route-labels'

type NginxRouteControlWidgetProps = {
    containers: string[]
    labels: NginxRouteLabels
    role: string
}

const MANAGE_ROLES = ['owner', 'admin']
const SKELETON_ROW_COUNT = 3

export const NginxRouteControlWidget: FC<NginxRouteControlWidgetProps> = ({ containers, labels, role }) => {
    const [busy, setBusy] = useState<string>()
    const { data, isPending } = useGetNginxRoutes()
    const routes = data ?? []
    const canManage = MANAGE_ROLES.includes(role)
    const createRoute = useCreateNginxRoute()
    const removeRoute = useRemoveNginxRoute()

    const toMessage = (error: unknown) => (error instanceof Error ? error.message : labels.failed)

    const create = async (input: Parameters<typeof createRoute.mutateAsync>[0]) => {
        setBusy('create')
        try {
            await createRoute.mutateAsync(input)
            toast.success(labels.created)
        } catch (createError) {
            toast.error(toMessage(createError))
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (route: NginxProxyRoute, confirmation: string) => {
        setBusy(route.id)
        try {
            await removeRoute.mutateAsync({ routeId: route.id, confirmation })
            toast.success(labels.removed)
        } catch (removeError) {
            toast.error(toMessage(removeError))
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="nginx-routes-title" title={labels.title} badge={routes.length}>
            {canManage && (
                <NginxRouteCreateForm busy={busy === 'create'} containers={containers} labels={labels} onCreate={(input) => void create(input)} />
            )}
            {isPending && (
                <div className="grid gap-px bg-background p-px">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index).map((index) => (
                        <Skeleton key={index} className="h-11 w-full" />
                    ))}
                </div>
            )}
            {!isPending && routes.length === 0 && (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {!isPending && routes.length > 0 && (
                <NginxRouteTable busyRouteId={busy} canManage={canManage} labels={labels} onRemove={remove} routes={routes} />
            )}
        </WidgetSection>
    )
}
