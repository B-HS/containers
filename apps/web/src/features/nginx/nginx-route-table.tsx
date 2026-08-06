'use client'

import type { FC } from 'react'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Switch } from '@shared/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'

type NginxRouteTableProps = {
    busyRouteId: string | undefined
    canManage: boolean
    labels: {
        actions: string
        cancel: string
        confirmation: string
        confirmationMismatch: string
        confirmRemoveTitle: string
        container: string
        enabled: string
        hostname: string
        managed: string
        managedRemoveWarning: string
        protocol: string
        remove: string
        removeImpact: string
        routeEdit: string
    }
    onEdit: (route: NginxProxyRoute) => void
    onRemove: (route: NginxProxyRoute, confirmation: string) => void
    onToggleEnabled: (route: NginxProxyRoute) => void
    routes: NginxProxyRoute[]
}

export const NginxRouteTable: FC<NginxRouteTableProps> = ({ busyRouteId, canManage, labels, onEdit, onRemove, onToggleEnabled, routes }) => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>{labels.hostname}</TableHead>
                <TableHead>{labels.container}</TableHead>
                <TableHead>{labels.protocol}</TableHead>
                <TableHead>{labels.enabled}</TableHead>
                {canManage && <TableHead className="text-right">{labels.actions}</TableHead>}
            </TableRow>
        </TableHeader>
        <TableBody>
            {routes.map((route) => (
                <TableRow key={route.id} className="odd:bg-overlay-subtle">
                    <TableCell className="max-w-0 truncate font-medium text-text-strong">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">
                                {route.hostname}
                                {route.path}
                            </span>
                            {route.managedBy === null ? null : <Badge variant="attention">{labels.managed}</Badge>}
                        </span>
                    </TableCell>
                    <TableCell className="max-w-0 truncate font-mono text-text-muted">
                        {route.targetContainer}:{route.targetPort}
                    </TableCell>
                    <TableCell>
                        <Badge variant="neutral">{route.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                        <Switch
                            aria-label={labels.enabled}
                            checked={route.enabled}
                            disabled={!canManage || busyRouteId === route.id}
                            id={`route-enabled-${route.id}`}
                            onCheckedChange={() => onToggleEnabled(route)}
                        />
                    </TableCell>
                    {canManage && (
                        <TableCell className="flex flex-wrap justify-end gap-2 text-right">
                            <Button disabled={busyRouteId === route.id} onClick={() => onEdit(route)} size="xs" type="button" variant="outline">
                                {labels.routeEdit}
                            </Button>
                            <ConfirmRemoveDialog
                                cancelLabel={labels.cancel}
                                confirmationLabel={labels.confirmation}
                                description={route.managedBy === null ? labels.removeImpact : `${labels.removeImpact} ${labels.managedRemoveWarning}`}
                                disabled={busyRouteId === route.id}
                                expectedValue={`${route.hostname}${route.path}`}
                                inputId={`route-confirm-${route.id}`}
                                mismatchLabel={labels.confirmationMismatch}
                                onConfirm={() => onRemove(route, `${route.hostname}${route.path}`)}
                                removeLabel={labels.remove}
                                target={`${route.hostname}${route.path}`}
                                title={labels.confirmRemoveTitle}
                                trigger={
                                    <Button size="xs" type="button" variant="destructive">
                                        {labels.remove}
                                    </Button>
                                }
                            />
                        </TableCell>
                    )}
                </TableRow>
            ))}
        </TableBody>
    </Table>
)
