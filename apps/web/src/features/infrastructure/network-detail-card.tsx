'use client'

import type { FC } from 'react'
import type { NetworkSummary } from '@containers/contracts/engine-control'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'

type NetworkDetailCardProps = {
    busy: boolean
    canRemove: boolean
    labels: {
        cancel: string
        confirmation: string
        confirmRemoveTitle: string
        containers: string
        driver: string
        gateway: string
        internal: string
        networkRemoveImpact: string
        networks: string
        remove: string
        subnet: string
    }
    network: NetworkSummary
    onRemove: (networkId: string, confirmation: string) => void
}

export const NetworkDetailCard: FC<NetworkDetailCardProps> = ({ busy, canRemove, labels, network, onRemove }) => (
    <div className="grid min-w-0 gap-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-text-strong">{network.name}</h3>
            <Badge variant="neutral">{network.driver}</Badge>
            {network.internal && <Badge variant="attention">{labels.internal}</Badge>}
        </div>
        <dl className="grid min-w-0 gap-4 text-xs sm:grid-cols-3">
            <div className="min-w-0">
                <dt className="text-text-subtle">{labels.networks}</dt>
                <dd className="mt-1 truncate font-mono text-sm text-text-strong tabular-nums">{network.id.slice(0, 12)}</dd>
            </div>
            <div className="min-w-0">
                <dt className="text-text-subtle">{labels.driver}</dt>
                <dd className="mt-1 truncate text-sm text-text-strong">{network.driver}</dd>
            </div>
            <div className="min-w-0">
                <dt className="text-text-subtle">{labels.containers}</dt>
                <dd className="mt-1 truncate text-sm text-text-strong tabular-nums">{network.containerCount}</dd>
            </div>
            {network.subnets.map((entry) => (
                <div key={entry.subnet} className="min-w-0">
                    <dt className="text-text-subtle">
                        {labels.subnet} · {labels.gateway}
                    </dt>
                    <dd className="mt-1 truncate font-mono text-sm text-text-strong">
                        {entry.subnet} · {entry.gateway}
                    </dd>
                </div>
            ))}
        </dl>
        {canRemove && (
            <div className="bg-overlay-subtle p-4">
                <ConfirmRemoveDialog
                    cancelLabel={labels.cancel}
                    confirmationLabel={labels.confirmation}
                    description={labels.networkRemoveImpact}
                    disabled={busy}
                    expectedValue={network.name}
                    inputId={`network-confirm-${network.id}`}
                    onConfirm={() => onRemove(network.id, network.name)}
                    removeLabel={labels.remove}
                    target={network.name}
                    title={labels.confirmRemoveTitle}
                    trigger={
                        <Button size="sm" type="button" variant="destructive">
                            {labels.remove}
                        </Button>
                    }
                />
            </div>
        )}
    </div>
)
