'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { useCreateNginxRoute, useGetNginxRoutes, useRemoveNginxRoute, useUpdateNginxRoute } from '@entities/nginx/nginx.query'
import { useGetContainerList } from '@entities/engine/engine.query'
import { NginxRouteCreateForm } from '@features/nginx/nginx-route-create-form'
import { NginxRouteTable } from '@features/nginx/nginx-route-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'
import type { NginxRouteLabels } from './nginx-route-labels'

type NginxRouteControlWidgetProps = {
    labels: NginxRouteLabels
    role: string
    routableNetworks: string[]
}

const CONTAINER_ID_PREFIX_LENGTH = 12
const MANAGE_ROLES = ['owner', 'admin']
const SKELETON_ROW_COUNT = 3

export const NginxRouteControlWidget: FC<NginxRouteControlWidgetProps> = ({ labels, role, routableNetworks }) => {
    const [busy, setBusy] = useState<string>()
    const [editingRouteId, setEditingRouteId] = useState<string>()
    const searchParams = useSearchParams()
    const containerList = useGetContainerList()
    const containers = (containerList.data ?? []).map((container) => ({
        exposedPorts: container.exposedPorts,
        name: container.names[0] ?? container.id.slice(0, CONTAINER_ID_PREFIX_LENGTH),
        networks: container.networks,
        state: container.state,
    }))
    const { data, isPending } = useGetNginxRoutes()
    const routes = data ?? []
    const canManage = MANAGE_ROLES.includes(role)
    const createRoute = useCreateNginxRoute()
    const removeRoute = useRemoveNginxRoute()
    const updateRoute = useUpdateNginxRoute()
    const editingRoute = routes.find((route) => route.id === editingRouteId)

    const toMessage = (error: unknown) => (error instanceof Error ? error.message : labels.failed)

    const create = async (input: Parameters<typeof createRoute.mutateAsync>[0]) => {
        setBusy('create')
        try {
            if (editingRouteId === undefined) {
                await createRoute.mutateAsync(input)
                toast.success(labels.created)
            } else {
                await updateRoute.mutateAsync({ route: input, routeId: editingRouteId })
                setEditingRouteId(undefined)
                toast.success(labels.updated)
            }
        } catch (createError) {
            toast.error(toMessage(createError))
        } finally {
            setBusy(undefined)
        }
    }

    const toggleEnabled = async (route: NginxProxyRoute) => {
        setBusy(route.id)
        try {
            await updateRoute.mutateAsync({
                route: {
                    bodySizeMegabytes: route.bodySizeMegabytes,
                    enabled: !route.enabled,
                    hostname: route.hostname,
                    path: route.path,
                    pathMode: route.pathMode,
                    protocol: route.protocol,
                    stripPrefix: route.stripPrefix,
                    targetContainer: route.targetContainer,
                    targetPort: route.targetPort,
                    timeoutSeconds: route.timeoutSeconds,
                },
                routeId: route.id,
            })
            toast.success(labels.updated)
        } catch (updateError) {
            toast.error(toMessage(updateError))
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
                <NginxRouteCreateForm
                    key={editingRouteId ?? 'new'}
                    busy={busy === 'create'}
                    containers={containers}
                    defaultTarget={{ container: searchParams.get('container') ?? '', port: searchParams.get('port') ?? '' }}
                    editing={
                        editingRoute
                            ? {
                                  bodySizeMegabytes: editingRoute.bodySizeMegabytes,
                                  enabled: editingRoute.enabled,
                                  hostname: editingRoute.hostname,
                                  path: editingRoute.path,
                                  pathMode: editingRoute.pathMode,
                                  protocol: editingRoute.protocol,
                                  stripPrefix: editingRoute.stripPrefix,
                                  targetContainer: editingRoute.targetContainer,
                                  targetPort: editingRoute.targetPort,
                                  timeoutSeconds: editingRoute.timeoutSeconds,
                              }
                            : null
                    }
                    labels={labels}
                    onCancelEdit={() => setEditingRouteId(undefined)}
                    onCreate={(input) => void create(input)}
                    routableNetworks={routableNetworks}
                />
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
                <NginxRouteTable
                    busyRouteId={busy}
                    canManage={canManage}
                    labels={labels}
                    onEdit={(route) => setEditingRouteId(route.id)}
                    onRemove={remove}
                    onToggleEnabled={(route) => void toggleEnabled(route)}
                    routes={routes}
                />
            )}
        </WidgetSection>
    )
}
