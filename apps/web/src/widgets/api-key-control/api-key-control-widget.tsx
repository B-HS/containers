'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { z } from 'zod'
import { API_KEY_SCOPE, apiKeyListSchema } from '@containers/contracts/api-key'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type ApiKey = z.infer<typeof apiKeyListSchema>[number]

type ApiKeyControlWidgetProps = {
    apiKeys: ApiKey[]
    labels: {
        create: string
        createdToken: string
        empty: string
        expires: string
        failed: string
        name: string
        revoke: string
        scopes: string
        title: string
        tokenWarning: string
    }
}

export const ApiKeyControlWidget: FC<ApiKeyControlWidgetProps> = ({ apiKeys: initialApiKeys, labels }) => {
    const [apiKeys, setApiKeys] = useState(initialApiKeys)
    const [busy, setBusy] = useState(false)
    const [createdToken, setCreatedToken] = useState<string>()
    const [error, setError] = useState<string>()

    const create = async (form: HTMLFormElement) => {
        setBusy(true)
        setError(undefined)
        setCreatedToken(undefined)
        const formData = new FormData(form)
        const scopes = [
            API_KEY_SCOPE.ARTIFACT_READ,
            API_KEY_SCOPE.ARTIFACT_UPLOAD,
            API_KEY_SCOPE.BACKUP_READ,
            API_KEY_SCOPE.BACKUP_WRITE,
            API_KEY_SCOPE.DEPLOYMENT_READ,
            API_KEY_SCOPE.DEPLOYMENT_WRITE,
            API_KEY_SCOPE.IMAGE_LOAD,
            API_KEY_SCOPE.SECRET_READ,
            API_KEY_SCOPE.SECRET_WRITE,
        ].filter((scope) => formData.get(scope) === 'on')
        try {
            const response = await fetch('/api/api-keys', {
                body: JSON.stringify({ expiresInDays: Number(formData.get('expiresInDays')), name: formData.get('name'), scopes }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            const body = await response.json()
            if (!response.ok) {
                throw new Error(parseApiError(body, labels.failed))
            }
            const { token, ...record } = body.data as ApiKey & { token: string }
            setCreatedToken(token)
            setApiKeys((current) => [record, ...current])
            form.reset()
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (id: string) => {
        setBusy(true)
        setError(undefined)
        try {
            const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            const revokedAt = new Date().toISOString()
            setApiKeys((current) => current.map((key) => (key.id === id ? { ...key, revokedAt } : key)))
        } catch (revokeError) {
            setError(revokeError instanceof Error ? revokeError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="api-key-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="api-key-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{apiKeys.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {createdToken ? (
                <div className="mx-3 mb-3 bg-background p-3" role="status">
                    <p className="text-sm font-semibold">{labels.createdToken}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{labels.tokenWarning}</p>
                    <code className="mt-3 block overflow-auto bg-card p-3 text-xs">{createdToken}</code>
                </div>
            ) : null}
            <form
                className="grid gap-3 border-t border-background p-3"
                onSubmit={(event) => {
                    event.preventDefault()
                    void create(event.currentTarget)
                }}
            >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="grid gap-2">
                        <Label htmlFor="api-key-name">{labels.name}</Label>
                        <Input id="api-key-name" name="name" required maxLength={80} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="api-key-expiry">{labels.expires}</Label>
                        <Input id="api-key-expiry" name="expiresInDays" type="number" defaultValue={30} min={1} max={365} required />
                    </div>
                </div>
                <fieldset className="grid gap-2">
                    <legend className="text-sm font-medium">{labels.scopes}</legend>
                    <div className="flex flex-wrap gap-3 text-sm">
                        {[
                            API_KEY_SCOPE.ARTIFACT_READ,
                            API_KEY_SCOPE.ARTIFACT_UPLOAD,
                            API_KEY_SCOPE.BACKUP_READ,
                            API_KEY_SCOPE.BACKUP_WRITE,
                            API_KEY_SCOPE.DEPLOYMENT_READ,
                            API_KEY_SCOPE.DEPLOYMENT_WRITE,
                            API_KEY_SCOPE.IMAGE_LOAD,
                            API_KEY_SCOPE.SECRET_READ,
                            API_KEY_SCOPE.SECRET_WRITE,
                        ].map((scope) => (
                            <Label key={scope} className="flex items-center gap-2">
                                <input type="checkbox" name={scope} defaultChecked /> {scope}
                            </Label>
                        ))}
                    </div>
                </fieldset>
                <Button className="justify-self-start" type="submit" disabled={busy}>
                    {labels.create}
                </Button>
            </form>
            {apiKeys.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background">
                {apiKeys.map((apiKey) => (
                    <Card key={apiKey.id} className="min-w-0 gap-2 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{apiKey.name}</p>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{apiKey.prefix}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{apiKey.scopes.join(' · ')}</p>
                            </div>
                            {apiKey.revokedAt ? (
                                <Badge variant="muted">revoked</Badge>
                            ) : (
                                <Button type="button" disabled={busy} onClick={() => void revoke(apiKey.id)}>
                                    {labels.revoke}
                                </Button>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    )
}
