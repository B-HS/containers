'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type NetworkCreateInput = {
    gateway: string
    internal: boolean
    name: string
    subnet: string
}

type NetworkCreateFormProps = {
    busy: boolean
    labels: {
        create: string
        gateway: string
        internal: string
        networkCreate: string
        networkName: string
        subnet: string
    }
    onCreate: (input: NetworkCreateInput) => void
}

export const NetworkCreateForm: FC<NetworkCreateFormProps> = ({ busy, labels, onCreate }) => {
    const [internal, setInternal] = useState(false)

    return (
        <form
            className="grid gap-4 bg-surface-3 p-5"
            onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                onCreate({
                    gateway: String(form.get('gateway') ?? '').trim(),
                    internal,
                    name: String(form.get('name') ?? '').trim(),
                    subnet: String(form.get('subnet') ?? '').trim(),
                })
            }}
        >
            <p className="text-sm font-medium text-text-strong">{labels.networkCreate}</p>
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="grid gap-2">
                    <Label htmlFor="new-network-name">{labels.networkName}</Label>
                    <Input id="new-network-name" name="name" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="new-network-subnet">{labels.subnet}</Label>
                    <Input id="new-network-subnet" name="subnet" placeholder="172.30.0.0/16" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="new-network-gateway">{labels.gateway}</Label>
                    <Input id="new-network-gateway" name="gateway" placeholder="172.30.0.1" />
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <Label htmlFor="new-network-internal" className="text-text-muted">
                    <Checkbox id="new-network-internal" checked={internal} onCheckedChange={(checked) => setInternal(checked === true)} />
                    {labels.internal}
                </Label>
                <Button type="submit" size="sm" disabled={busy}>
                    {labels.create}
                </Button>
            </div>
        </form>
    )
}
