'use client'

import type { FC } from 'react'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'

type NginxRouteTableProps = {
    busyRouteId: string | undefined
    canManage: boolean
    labels: {
        actions: string
        cancel: string
        confirmation: string
        confirmRemoveTitle: string
        container: string
        hostname: string
        protocol: string
        remove: string
        removeImpact: string
    }
    onRemove: (route: NginxProxyRoute, confirmation: string) => void
    routes: NginxProxyRoute[]
}

export const NginxRouteTable: FC<NginxRouteTableProps> = ({ busyRouteId, canManage, labels, onRemove, routes }) => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>{labels.hostname}</TableHead>
                <TableHead>{labels.container}</TableHead>
                <TableHead>{labels.protocol}</TableHead>
                {canManage && <TableHead className="text-right">{labels.actions}</TableHead>}
            </TableRow>
        </TableHeader>
        <TableBody>
            {routes.map((route) => (
                <TableRow key={route.id} className="odd:bg-overlay-subtle">
                    <TableCell className="max-w-0 truncate font-medium text-text-strong">
                        {route.hostname}
                        {route.path}
                    </TableCell>
                    <TableCell className="max-w-0 truncate font-mono text-text-muted">
                        {route.targetContainer}:{route.targetPort}
                    </TableCell>
                    <TableCell>
                        <Badge variant="neutral">{route.protocol}</Badge>
                    </TableCell>
                    {canManage && (
                        <TableCell className="text-right">
                            <ConfirmRemoveDialog
                                cancelLabel={labels.cancel}
                                confirmationLabel={labels.confirmation}
                                description={labels.removeImpact}
                                disabled={busyRouteId === route.id}
                                expectedValue={`${route.hostname}${route.path}`}
                                inputId={`route-confirm-${route.id}`}
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
