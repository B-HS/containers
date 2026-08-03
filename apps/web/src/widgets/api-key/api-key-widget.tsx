'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { z } from 'zod'
import { API_KEY_SCOPE, apiKeyListSchema } from '@containers/contracts/api-key'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Checkbox } from '@shared/ui/checkbox'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { WidgetSection } from '@shared/common/widget-section'

type ApiKey = z.infer<typeof apiKeyListSchema>[number]

const API_KEY_SCOPES = [
    API_KEY_SCOPE.ARTIFACT_READ,
    API_KEY_SCOPE.ARTIFACT_UPLOAD,
    API_KEY_SCOPE.BACKUP_READ,
    API_KEY_SCOPE.BACKUP_WRITE,
    API_KEY_SCOPE.DEPLOYMENT_READ,
    API_KEY_SCOPE.DEPLOYMENT_WRITE,
    API_KEY_SCOPE.IMAGE_LOAD,
    API_KEY_SCOPE.SECRET_READ,
    API_KEY_SCOPE.SECRET_WRITE,
]

type ApiKeyWidgetProps = {
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

export const ApiKeyWidget: FC<ApiKeyWidgetProps> = ({ apiKeys: initialApiKeys, labels }) => {
    const [apiKeys, setApiKeys] = useState(initialApiKeys)
    const [busy, setBusy] = useState(false)
    const [createdToken, setCreatedToken] = useState<string>()
    const [error, setError] = useState<string>()
    const [scopes, setScopes] = useState<Set<string>>(() => new Set(API_KEY_SCOPES))

    const create = async (form: HTMLFormElement) => {
        setBusy(true)
        setError(undefined)
        setCreatedToken(undefined)
        const formData = new FormData(form)
        const selectedScopes = API_KEY_SCOPES.filter((scope) => scopes.has(scope))
        try {
            const response = await fetch('/api/api-keys', {
                body: JSON.stringify({ expiresInDays: Number(formData.get('expiresInDays')), name: formData.get('name'), scopes: selectedScopes }),
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
        <WidgetSection id="api-key-control-title" title={labels.title} badge={apiKeys.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
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
                        {API_KEY_SCOPES.map((scope) => (
                            <div key={scope} className="flex items-center gap-2">
                                <Checkbox
                                    id={`api-key-scope-${scope}`}
                                    checked={scopes.has(scope)}
                                    onCheckedChange={(checked) =>
                                        setScopes((current) => {
                                            const next = new Set(current)
                                            if (checked === true) {
                                                next.add(scope)
                                            } else {
                                                next.delete(scope)
                                            }
                                            return next
                                        })
                                    }
                                />
                                <Label htmlFor={`api-key-scope-${scope}`}>{scope}</Label>
                            </div>
                        ))}
                    </div>
                </fieldset>
                <Button className="justify-self-start" type="submit" variant="default" disabled={busy}>
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
                                <Button type="button" variant="default" disabled={busy} onClick={() => void revoke(apiKey.id)}>
                                    {labels.revoke}
                                </Button>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </WidgetSection>
    )
}
