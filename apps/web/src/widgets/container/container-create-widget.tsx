'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NetworkSummary } from '@containers/contracts/engine-control'
import { useCreateContainer } from '@entities/engine/engine.query'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Textarea } from '@shared/ui/textarea'

type ContainerCreateWidgetProps = {
    images: Array<{ id: string; repoTags: string[] }>
    labels: {
        autoStart: string
        command: string
        cpu: string
        create: string
        failed: string
        image: string
        memory: string
        name: string
        network: string
        port: string
        readOnly: string
        title: string
    }
    networks: NetworkSummary[]
    role: string
}

export const ContainerCreateWidget: FC<ContainerCreateWidgetProps> = ({ images, labels, networks, role }) => {
    const [autoStart, setAutoStart] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [image, setImage] = useState(images[0]?.repoTags[0] ?? images[0]?.id ?? '')
    const [network, setNetwork] = useState('containers_edge')
    const [readOnly, setReadOnly] = useState(true)
    const canCreate = ['owner', 'admin'].includes(role)
    const createContainer = useCreateContainer()

    if (!canCreate) {
        return null
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="container-create-title">
            <header className="p-3">
                <h2 id="container-create-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            <Card className="p-3">
                <form
                    className="grid gap-3 xl:grid-cols-2"
                    onSubmit={async (event) => {
                        event.preventDefault()
                        setBusy(true)
                        setError(undefined)
                        const form = new FormData(event.currentTarget)
                        const port = String(form.get('port') ?? '').trim()
                        const command = String(form.get('command') ?? '')
                            .split('\n')
                            .map((part) => part.trim())
                            .filter((part) => part.length > 0)

                        try {
                            await createContainer.mutateAsync({
                                autoStart,
                                command,
                                containerPort: port ? Number(port) : undefined,
                                image,
                                memoryBytes: Number(form.get('memoryMiB')) * 1_048_576,
                                name: String(form.get('name') ?? ''),
                                nanoCpus: Number(form.get('cpu')) * 1_000_000_000,
                                network,
                                readOnlyRootFilesystem: readOnly,
                            })

                            window.location.reload()
                        } catch {
                            setError(labels.failed)
                        } finally {
                            setBusy(false)
                        }
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="container-create-name">{labels.name}</Label>
                        <Input id="container-create-name" name="name" required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="container-create-image">{labels.image}</Label>
                        <Select value={image} onValueChange={setImage} disabled={images.length === 0}>
                            <SelectTrigger id="container-create-image" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {images.map((imageItem) => {
                                    const identifier = imageItem.repoTags[0] ?? imageItem.id
                                    return (
                                        <SelectItem key={imageItem.id} value={identifier}>
                                            {identifier}
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="container-create-network">{labels.network}</Label>
                        <Select value={network} onValueChange={setNetwork}>
                            <SelectTrigger id="container-create-network" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {networks
                                    .filter((networkItem) => networkItem.driver === 'bridge')
                                    .map((networkItem) => (
                                        <SelectItem key={networkItem.id} value={networkItem.name}>
                                            {networkItem.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-memory">{labels.memory}</Label>
                            <Input id="container-create-memory" name="memoryMiB" type="number" min="16" max="65536" defaultValue="512" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-cpu">{labels.cpu}</Label>
                            <Input id="container-create-cpu" name="cpu" type="number" min="0.1" max="10" step="0.1" defaultValue="1" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-port">{labels.port}</Label>
                            <Input id="container-create-port" name="port" type="number" min="1" max="65535" />
                        </div>
                    </div>
                    <div className="grid gap-2 xl:col-span-2">
                        <Label htmlFor="container-create-command">{labels.command}</Label>
                        <Textarea id="container-create-command" name="command" placeholder={'executable\nargument'} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs xl:col-span-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="container-create-auto-start"
                                checked={autoStart}
                                onCheckedChange={(checked) => setAutoStart(checked === true)}
                            />
                            <Label htmlFor="container-create-auto-start">{labels.autoStart}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="container-create-read-only"
                                checked={readOnly}
                                onCheckedChange={(checked) => setReadOnly(checked === true)}
                            />
                            <Label htmlFor="container-create-read-only">{labels.readOnly}</Label>
                        </div>
                    </div>
                    <Button type="submit" variant="default" disabled={busy || images.length === 0} className="xl:col-span-2">
                        {labels.create}
                    </Button>
                </form>
            </Card>
        </section>
    )
}
