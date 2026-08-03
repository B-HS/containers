'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NetworkSummary, VolumeSummary } from '@containers/contracts/engine-control'
import { formatBytes } from '@shared/lib/format-bytes'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

type InfrastructureWidgetProps = {
    labels: {
        confirmation: string
        containers: string
        create: string
        driver: string
        empty: string
        failed: string
        force: string
        gateway: string
        internal: string
        networks: string
        networkName: string
        remove: string
        size: string
        subnet: string
        title: string
        volumes: string
        volumeName: string
    }
    networks: NetworkSummary[]
    role: string
    volumes: VolumeSummary[]
}

type InfrastructureLabels = InfrastructureWidgetProps['labels']

type NetworkDetailCardProps = {
    busy: boolean
    canRemove: boolean
    labels: InfrastructureLabels
    network: NetworkSummary
    onRemove: (networkId: string, confirmation: string) => void
}

const NetworkDetailCard: FC<NetworkDetailCardProps> = ({ busy, canRemove, labels, network, onRemove }) => (
    <div className="grid min-w-0 gap-4">
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{network.name}</h3>
                <Badge variant="muted">{network.driver}</Badge>
            </div>
            <dl className="mt-3 grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="min-w-0">
                    <dt>{labels.networks}</dt>
                    <dd className="mt-1 truncate font-mono text-foreground">{network.id.slice(0, 12)}</dd>
                </div>
                <div className="min-w-0">
                    <dt>{labels.driver}</dt>
                    <dd className="mt-1 truncate text-foreground">{network.driver}</dd>
                </div>
                <div className="min-w-0">
                    <dt>{labels.containers}</dt>
                    <dd className="mt-1 truncate text-foreground">{network.containerCount}</dd>
                </div>
            </dl>
        </div>
        {canRemove ? (
            <form
                className="grid gap-2 border-t border-background pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                onSubmit={(event) => {
                    event.preventDefault()
                    const confirmation = String(new FormData(event.currentTarget).get('confirmation') ?? '')
                    onRemove(network.id, confirmation)
                }}
            >
                <div className="grid gap-2">
                    <Label htmlFor={`network-confirm-${network.id}`}>
                        {labels.confirmation}: {network.name}
                    </Label>
                    <Input id={`network-confirm-${network.id}`} name="confirmation" autoComplete="off" required />
                </div>
                <Button variant="default" className="bg-red-700 text-white" type="submit" disabled={busy}>
                    {labels.remove}
                </Button>
            </form>
        ) : null}
    </div>
)

type VolumeDetailCardProps = {
    busy: boolean
    canRemove: boolean
    labels: InfrastructureLabels
    onRemove: (volumeName: string, confirmation: string, force: boolean) => void
    volume: VolumeSummary
}

const VolumeDetailCard: FC<VolumeDetailCardProps> = ({ busy, canRemove, labels, onRemove, volume }) => {
    const [force, setForce] = useState(false)

    return (
        <div className="grid min-w-0 gap-4">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{volume.name}</h3>
                    <Badge variant="muted">{volume.driver}</Badge>
                </div>
                <dl className="mt-3 grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="min-w-0">
                        <dt>{labels.volumes}</dt>
                        <dd className="mt-1 truncate font-mono text-foreground">{volume.name}</dd>
                    </div>
                    <div className="min-w-0">
                        <dt>{labels.size}</dt>
                        <dd className="mt-1 truncate font-mono text-foreground">{formatBytes(volume.sizeBytes)}</dd>
                    </div>
                </dl>
            </div>
            {canRemove ? (
                <form
                    className="grid gap-2 border-t border-background pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const formData = new FormData(event.currentTarget)
                        onRemove(volume.name, String(formData.get('confirmation') ?? ''), force)
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor={`volume-confirm-${volume.name}`}>
                            {labels.confirmation}: {volume.name}
                        </Label>
                        <Input id={`volume-confirm-${volume.name}`} name="confirmation" autoComplete="off" required />
                    </div>
                    <Label htmlFor={`volume-force-${volume.name}`} className="flex h-10 items-center gap-2 px-3">
                        <Checkbox id={`volume-force-${volume.name}`} checked={force} onCheckedChange={(checked) => setForce(checked === true)} />
                        {labels.force}
                    </Label>
                    <Button variant="default" className="bg-red-700 text-white" type="submit" disabled={busy}>
                        {labels.remove}
                    </Button>
                </form>
            ) : null}
        </div>
    )
}

type NetworkTabProps = {
    canRemove: boolean
    labels: InfrastructureLabels
    networks: NetworkSummary[]
}

const NetworkTab: FC<NetworkTabProps> = ({ canRemove, labels, networks }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const [internal, setInternal] = useState(false)
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(networks)

    const create = async (input: unknown) => {
        setBusy('create')
        setError(undefined)

        try {
            const response = await fetch('/api/networks', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.failed))
                return
            }

            window.location.reload()
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (networkId: string, confirmation: string) => {
        setBusy(networkId)
        setError(undefined)

        try {
            const response = await fetch(`/api/networks/${encodeURIComponent(networkId)}`, {
                body: JSON.stringify({ confirmation, force: false }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.failed))
                return
            }

            window.location.reload()
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <TabsContent className="border-t border-background" value="networks">
            {error ? (
                <p className="mx-3 my-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {canRemove ? (
                <form
                    className="grid gap-2 border-b border-background p-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        const subnet = String(form.get('subnet') ?? '').trim()
                        const gateway = String(form.get('gateway') ?? '').trim()
                        void create({
                            attachable: false,
                            gateway: gateway || undefined,
                            internal,
                            name: String(form.get('name') ?? ''),
                            subnet: subnet || undefined,
                        })
                    }}
                >
                    <Label htmlFor="new-network-name">{labels.networkName}</Label>
                    <Input id="new-network-name" name="name" required />
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="new-network-subnet">{labels.subnet}</Label>
                            <Input id="new-network-subnet" name="subnet" placeholder="172.30.0.0/16" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-network-gateway">{labels.gateway}</Label>
                            <Input id="new-network-gateway" name="gateway" placeholder="172.30.0.1" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <Checkbox id="new-network-internal" checked={internal} onCheckedChange={(checked) => setInternal(checked === true)} />
                        <Label htmlFor="new-network-internal">{labels.internal}</Label>
                    </div>
                    <Button type="submit" variant="default" className="justify-self-start" disabled={busy === 'create'}>
                        {labels.create}
                    </Button>
                </form>
            ) : null}
            {networks.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
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
                    {selectedItem ? (
                        <NetworkDetailCard
                            busy={busy === selectedItem.id}
                            canRemove={canRemove}
                            labels={labels}
                            network={selectedItem}
                            onRemove={remove}
                        />
                    ) : null}
                </MasterDetail>
            )}
        </TabsContent>
    )
}

type VolumeTabProps = {
    canRemove: boolean
    labels: InfrastructureLabels
    volumes: VolumeSummary[]
}

const VolumeTab: FC<VolumeTabProps> = ({ canRemove, labels, volumes }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const volumesWithId = volumes.map((volume) => ({ ...volume, id: volume.name }))
    const { onSelect, selectedId, selectedItem } = useMasterDetailSelection(volumesWithId)

    const create = async (name: string) => {
        setBusy('create')
        setError(undefined)

        try {
            const response = await fetch('/api/volumes', {
                body: JSON.stringify({ name }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.failed))
                return
            }

            window.location.reload()
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (volumeName: string, confirmation: string, force: boolean) => {
        setBusy(volumeName)
        setError(undefined)

        try {
            const response = await fetch(`/api/volumes/${encodeURIComponent(volumeName)}`, {
                body: JSON.stringify({ confirmation, force }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.failed))
                return
            }

            window.location.reload()
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <TabsContent className="border-t border-background" value="volumes">
            {error ? (
                <p className="mx-3 my-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {canRemove ? (
                <form
                    className="flex min-w-0 gap-px border-b border-background p-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void create(String(new FormData(event.currentTarget).get('name') ?? ''))
                    }}
                >
                    <Label htmlFor="new-volume-name" className="sr-only">
                        {labels.volumeName}
                    </Label>
                    <Input id="new-volume-name" name="name" className="min-w-0" required />
                    <Button type="submit" variant="default" disabled={busy === 'create'}>
                        {labels.create}
                    </Button>
                </form>
            ) : null}
            {volumes.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
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
                    {selectedItem ? (
                        <VolumeDetailCard
                            busy={busy === selectedItem.name}
                            canRemove={canRemove}
                            labels={labels}
                            onRemove={remove}
                            volume={selectedItem}
                        />
                    ) : null}
                </MasterDetail>
            )}
        </TabsContent>
    )
}

export const InfrastructureWidget: FC<InfrastructureWidgetProps> = ({ labels, networks, role, volumes }) => {
    const canRemove = ['owner', 'admin'].includes(role)

    return (
        <WidgetSection id="infrastructure-control-title" title={labels.title} badge={networks.length + volumes.length}>
            <Tabs className="border-t border-background" defaultValue="networks">
                <TabsList className="m-3">
                    <TabsTrigger value="networks">{labels.networks}</TabsTrigger>
                    <TabsTrigger value="volumes">{labels.volumes}</TabsTrigger>
                </TabsList>
                <NetworkTab canRemove={canRemove} labels={labels} networks={networks} />
                <VolumeTab canRemove={canRemove} labels={labels} volumes={volumes} />
            </Tabs>
        </WidgetSection>
    )
}
