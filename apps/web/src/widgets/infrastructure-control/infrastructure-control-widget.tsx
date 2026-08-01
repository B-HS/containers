'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NetworkSummary, VolumeSummary } from '@containers/contracts/engine-control'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type InfrastructureControlWidgetProps = {
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

const formatBytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MiB`

export const InfrastructureControlWidget: FC<InfrastructureControlWidgetProps> = ({ labels, networks, role, volumes }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const canRemove = ['owner', 'admin'].includes(role)

    const create = async (kind: 'networks' | 'volumes', input: unknown) => {
        setBusy(`create:${kind}`)
        setError(undefined)

        try {
            const response = await fetch(`/api/${kind}`, {
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

    const remove = async (kind: 'networks' | 'volumes', target: string, confirmation: string, force: boolean) => {
        setBusy(`${kind}:${target}`)
        setError(undefined)

        try {
            const response = await fetch(`/api/${kind}/${encodeURIComponent(target)}`, {
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
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="infrastructure-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="infrastructure-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{networks.length + volumes.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            <div className="grid gap-px bg-background xl:grid-cols-2">
                <div className="min-w-0 bg-card p-3">
                    <h3 className="mb-3 text-xs font-semibold">{labels.networks}</h3>
                    {canRemove ? (
                        <form
                            className="mb-3 grid gap-2 bg-background p-3"
                            onSubmit={(event) => {
                                event.preventDefault()
                                const form = new FormData(event.currentTarget)
                                const subnet = String(form.get('subnet') ?? '').trim()
                                const gateway = String(form.get('gateway') ?? '').trim()
                                void create('networks', {
                                    attachable: false,
                                    gateway: gateway || undefined,
                                    internal: form.get('internal') === 'on',
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
                            <label className="flex items-center gap-2 text-xs">
                                <input name="internal" type="checkbox" /> {labels.internal}
                            </label>
                            <Button type="submit" disabled={busy === 'create:networks'}>
                                {labels.create}
                            </Button>
                        </form>
                    ) : null}
                    {networks.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : null}
                    <div className="grid gap-px bg-background">
                        {networks.map((network) => (
                            <Card key={network.id} className="min-w-0 gap-3 p-3">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{network.name}</p>
                                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{network.id.slice(0, 12)}</p>
                                    </div>
                                    <Badge variant="muted">{network.driver}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {labels.containers}: {network.containerCount}
                                </p>
                                {canRemove ? (
                                    <form
                                        className="grid gap-2"
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            const confirmation = String(new FormData(event.currentTarget).get('confirmation') ?? '')
                                            void remove('networks', network.id, confirmation, false)
                                        }}
                                    >
                                        <Label htmlFor={`network-confirm-${network.id}`}>
                                            {labels.confirmation}: {network.name}
                                        </Label>
                                        <div className="flex min-w-0 gap-px">
                                            <Input id={`network-confirm-${network.id}`} name="confirmation" className="min-w-0" />
                                            <Button type="submit" disabled={busy === `networks:${network.id}`}>
                                                {labels.remove}
                                            </Button>
                                        </div>
                                    </form>
                                ) : null}
                            </Card>
                        ))}
                    </div>
                </div>
                <div className="min-w-0 bg-card p-3">
                    <h3 className="mb-3 text-xs font-semibold">{labels.volumes}</h3>
                    {canRemove ? (
                        <form
                            className="mb-3 grid gap-2 bg-background p-3"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void create('volumes', { name: String(new FormData(event.currentTarget).get('name') ?? '') })
                            }}
                        >
                            <Label htmlFor="new-volume-name">{labels.volumeName}</Label>
                            <Input id="new-volume-name" name="name" required />
                            <Button type="submit" disabled={busy === 'create:volumes'}>
                                {labels.create}
                            </Button>
                        </form>
                    ) : null}
                    {volumes.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : null}
                    <div className="grid gap-px bg-background">
                        {volumes.map((volume) => (
                            <Card key={volume.name} className="min-w-0 gap-3 p-3">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{volume.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {labels.size}: {formatBytes(volume.sizeBytes)}
                                        </p>
                                    </div>
                                    <Badge variant="muted">{volume.driver}</Badge>
                                </div>
                                {canRemove ? (
                                    <form
                                        className="grid gap-2"
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            const form = new FormData(event.currentTarget)
                                            void remove('volumes', volume.name, String(form.get('confirmation') ?? ''), form.get('force') === 'on')
                                        }}
                                    >
                                        <Label htmlFor={`volume-confirm-${volume.name}`}>
                                            {labels.confirmation}: {volume.name}
                                        </Label>
                                        <Input id={`volume-confirm-${volume.name}`} name="confirmation" />
                                        <label className="flex items-center gap-2 text-xs">
                                            <input name="force" type="checkbox" /> {labels.force}
                                        </label>
                                        <Button type="submit" disabled={busy === `volumes:${volume.name}`}>
                                            {labels.remove}
                                        </Button>
                                    </form>
                                ) : null}
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
