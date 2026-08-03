'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { registryCredentialSchema, type RegistryCredential } from '@containers/contracts/registry-credential'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'

type RegistryWidgetProps = {
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

export const RegistryWidget: FC<RegistryWidgetProps> = ({ credentials: initialCredentials, labels, role }) => {
    const [busy, setBusy] = useState<string>()
    const [credentialId, setCredentialId] = useState('__public__')
    const [credentials, setCredentials] = useState(initialCredentials)
    const [error, setError] = useState<string>()
    const [started, setStarted] = useState(false)
    const isOwner = role === 'owner'
    const { onSelect, selectedId, selectedItem: selectedCredential } = useMasterDetailSelection(credentials)

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
        <WidgetSection id="registry-control-title" title={labels.title} badge={credentials.length}>
            <p className="border-t border-background p-3 text-sm text-muted-foreground">{labels.notice}</p>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            <div className="gap-3 border-t border-background p-3">
                <form
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        void pull(String(data.get('reference') ?? ''), credentialId === '__public__' ? '' : credentialId)
                    }}
                >
                    <div className="grid gap-1">
                        <Label htmlFor="registry-pull-reference">{labels.pullReference}</Label>
                        <Input id="registry-pull-reference" name="reference" required placeholder="registry.example.com/team/image:tag" />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="registry-pull-credential">{labels.credential}</Label>
                        <Select value={credentialId} onValueChange={setCredentialId}>
                            <SelectTrigger id="registry-pull-credential" className="w-full">
                                <SelectValue placeholder={labels.publicCredential} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__public__">{labels.publicCredential}</SelectItem>
                                {credentials.map((credential) => (
                                    <SelectItem key={credential.id} value={credential.id}>
                                        {credential.name} · {credential.serverAddress}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" variant="default" disabled={busy !== undefined}>
                        {labels.pull}
                    </Button>
                </form>
                {started ? <p className="text-xs text-emerald-700">{labels.started}</p> : null}
            </div>
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
                    <Button type="submit" variant="default" disabled={busy !== undefined}>
                        {labels.save}
                    </Button>
                </form>
            ) : null}
            {credentials.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            {selectedCredential ? (
                <MasterDetail
                    empty={labels.empty}
                    items={credentials.map((credential) => ({
                        badge: labels.credential,
                        id: credential.id,
                        subtitle: `${credential.serverAddress} · ${labels.version} ${credential.version}`,
                        title: credential.name,
                    }))}
                    listLabel={labels.credential}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-3 p-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{selectedCredential.name}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{selectedCredential.serverAddress}</p>
                            <p className="text-xs text-muted-foreground">
                                {selectedCredential.username} · {labels.version} {selectedCredential.version}
                            </p>
                        </div>
                        {isOwner ? (
                            <div className="grid gap-2 md:grid-cols-2">
                                <form
                                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const form = event.currentTarget
                                        const data = new FormData(form)
                                        void upsert(selectedCredential.id, {
                                            name: selectedCredential.name,
                                            password: String(data.get('password') ?? ''),
                                            serverAddress: selectedCredential.serverAddress,
                                            username: selectedCredential.username,
                                        }).then((success) => {
                                            if (success) form.reset()
                                        })
                                    }}
                                >
                                    <div className="grid gap-1">
                                        <Label htmlFor={`registry-password-${selectedCredential.id}`}>{labels.password}</Label>
                                        <Input
                                            id={`registry-password-${selectedCredential.id}`}
                                            name="password"
                                            autoComplete="new-password"
                                            required
                                            type="password"
                                        />
                                    </div>
                                    <Button type="submit" variant="default" disabled={busy !== undefined}>
                                        {labels.rotate}
                                    </Button>
                                </form>
                                <form
                                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void remove(selectedCredential, String(new FormData(event.currentTarget).get('confirmation') ?? ''))
                                    }}
                                >
                                    <div className="grid gap-1">
                                        <Label htmlFor={`registry-confirmation-${selectedCredential.id}`}>
                                            {labels.confirmation}: {selectedCredential.name}
                                        </Label>
                                        <Input id={`registry-confirmation-${selectedCredential.id}`} name="confirmation" required />
                                    </div>
                                    <Button type="submit" variant="default" disabled={busy !== undefined}>
                                        {labels.remove}
                                    </Button>
                                </form>
                            </div>
                        ) : null}
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
