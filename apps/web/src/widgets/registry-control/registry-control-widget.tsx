'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { registryCredentialSchema, type RegistryCredential } from '@containers/contracts/registry-credential'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type RegistryControlWidgetProps = {
    credentials: RegistryCredential[]
    labels: {
        confirmation: string
        credential: string
        empty: string
        failed: string
        name: string
        notice: string
        password: string
        publicCredential: string
        pull: string
        pullReference: string
        remove: string
        rotate: string
        save: string
        serverAddress: string
        started: string
        title: string
        username: string
        version: string
    }
    role: string
}

const parseCredential = (body: unknown) => registryCredentialSchema.parse(body && typeof body === 'object' && 'data' in body ? body.data : undefined)

export const RegistryControlWidget: FC<RegistryControlWidgetProps> = ({ credentials: initialCredentials, labels, role }) => {
    const [busy, setBusy] = useState<string>()
    const [credentials, setCredentials] = useState(initialCredentials)
    const [error, setError] = useState<string>()
    const [started, setStarted] = useState(false)
    const isOwner = role === 'owner'

    const upsert = async (credentialId: string | undefined, input: Record<string, string>) => {
        const key = credentialId ?? 'create'
        setBusy(key)
        setError(undefined)
        try {
            const response = await fetch(credentialId === undefined ? '/api/registry-credentials' : `/api/registry-credentials/${credentialId}`, {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            const body: unknown = await response.json()
            if (!response.ok) throw new Error(parseApiError(body, labels.failed))
            const credential = parseCredential(body)
            setCredentials((current) => [...current.filter((candidate) => candidate.id !== credential.id), credential])
            return true
        } catch (upsertError) {
            setError(upsertError instanceof Error ? upsertError.message : labels.failed)
            return false
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (credential: RegistryCredential, confirmation: string) => {
        setBusy(credential.id)
        setError(undefined)
        try {
            const response = await fetch(`/api/registry-credentials/${credential.id}`, {
                body: JSON.stringify({ confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })
            if (!response.ok) throw new Error(parseApiError(await response.json(), labels.failed))
            setCredentials((current) => current.filter((candidate) => candidate.id !== credential.id))
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const pull = async (reference: string, credentialId: string) => {
        setBusy('pull')
        setError(undefined)
        setStarted(false)
        try {
            const response = await fetch('/api/images/pull', {
                body: JSON.stringify({ ...(credentialId ? { credentialId } : {}), reference }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            if (!response.ok) throw new Error(parseApiError(await response.json(), labels.failed))
            setStarted(true)
        } catch (pullError) {
            setError(pullError instanceof Error ? pullError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="registry-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="registry-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{credentials.length}</Badge>
            </header>
            <p className="border-t border-background p-3 text-sm text-muted-foreground">{labels.notice}</p>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            <Card className="gap-3 border-t border-background p-3">
                <form
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        void pull(String(data.get('reference') ?? ''), String(data.get('credentialId') ?? ''))
                    }}
                >
                    <div className="grid gap-1">
                        <Label htmlFor="registry-pull-reference">{labels.pullReference}</Label>
                        <Input id="registry-pull-reference" name="reference" required placeholder="registry.example.com/team/image:tag" />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="registry-pull-credential">{labels.credential}</Label>
                        <select id="registry-pull-credential" name="credentialId" className="h-10 bg-muted px-3 text-sm">
                            <option value="">{labels.publicCredential}</option>
                            {credentials.map((credential) => (
                                <option key={credential.id} value={credential.id}>
                                    {credential.name} · {credential.serverAddress}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" disabled={busy !== undefined}>
                        {labels.pull}
                    </Button>
                </form>
                {started ? <p className="text-xs text-emerald-700">{labels.started}</p> : null}
            </Card>
            {isOwner ? (
                <form
                    className="grid gap-2 border-t border-background p-3 sm:grid-cols-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const form = event.currentTarget
                        const data = new FormData(form)
                        void upsert(undefined, {
                            name: String(data.get('name') ?? ''),
                            password: String(data.get('password') ?? ''),
                            serverAddress: String(data.get('serverAddress') ?? ''),
                            username: String(data.get('username') ?? ''),
                        }).then((success) => {
                            if (success) form.reset()
                        })
                    }}
                >
                    {(['name', 'serverAddress', 'username', 'password'] as const).map((field) => (
                        <div key={field} className="grid gap-1">
                            <Label htmlFor={`registry-${field}`}>{labels[field]}</Label>
                            <Input
                                id={`registry-${field}`}
                                name={field}
                                autoComplete={field === 'password' ? 'new-password' : 'off'}
                                required
                                type={field === 'password' ? 'password' : 'text'}
                            />
                        </div>
                    ))}
                    <Button type="submit" disabled={busy !== undefined}>
                        {labels.save}
                    </Button>
                </form>
            ) : null}
            {credentials.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background">
                {credentials.map((credential) => (
                    <Card key={credential.id} className="gap-3 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{credential.name}</p>
                                <p className="truncate font-mono text-xs text-muted-foreground">{credential.serverAddress}</p>
                                <p className="text-xs text-muted-foreground">
                                    {credential.username} · {labels.version} {credential.version}
                                </p>
                            </div>
                        </div>
                        {isOwner ? (
                            <div className="grid gap-2 md:grid-cols-2">
                                <form
                                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const form = event.currentTarget
                                        const data = new FormData(form)
                                        void upsert(credential.id, {
                                            name: credential.name,
                                            password: String(data.get('password') ?? ''),
                                            serverAddress: credential.serverAddress,
                                            username: credential.username,
                                        }).then((success) => {
                                            if (success) form.reset()
                                        })
                                    }}
                                >
                                    <div className="grid gap-1">
                                        <Label htmlFor={`registry-password-${credential.id}`}>{labels.password}</Label>
                                        <Input
                                            id={`registry-password-${credential.id}`}
                                            name="password"
                                            autoComplete="new-password"
                                            required
                                            type="password"
                                        />
                                    </div>
                                    <Button type="submit" disabled={busy !== undefined}>
                                        {labels.rotate}
                                    </Button>
                                </form>
                                <form
                                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void remove(credential, String(new FormData(event.currentTarget).get('confirmation') ?? ''))
                                    }}
                                >
                                    <div className="grid gap-1">
                                        <Label htmlFor={`registry-confirmation-${credential.id}`}>
                                            {labels.confirmation}: {credential.name}
                                        </Label>
                                        <Input id={`registry-confirmation-${credential.id}`} name="confirmation" required />
                                    </div>
                                    <Button type="submit" disabled={busy !== undefined}>
                                        {labels.remove}
                                    </Button>
                                </form>
                            </div>
                        ) : null}
                    </Card>
                ))}
            </div>
        </section>
    )
}
