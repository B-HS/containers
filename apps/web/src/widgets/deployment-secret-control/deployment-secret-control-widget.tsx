'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { deploymentSecretSchema } from '@containers/contracts/deployment-secret'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { z } from 'zod'

type DeploymentSecret = z.infer<typeof deploymentSecretSchema>

type DeploymentSecretControlWidgetProps = {
    labels: {
        confirmation: string
        empty: string
        failed: string
        reference: string
        remove: string
        save: string
        title: string
        value: string
        valueNotice: string
        version: string
    }
    secrets: DeploymentSecret[]
}

const responseSchema = z.object({ data: deploymentSecretSchema, success: z.literal(true) })

export const DeploymentSecretControlWidget: FC<DeploymentSecretControlWidgetProps> = ({ labels, secrets: initialSecrets }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const [secrets, setSecrets] = useState(initialSecrets)

    const save = async (form: HTMLFormElement) => {
        setBusy('save')
        setError(undefined)
        const formData = new FormData(form)
        try {
            const response = await fetch('/api/deployment-secrets', {
                body: JSON.stringify({ reference: formData.get('reference'), value: formData.get('value') }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            const body: unknown = await response.json()
            if (!response.ok) {
                throw new Error(parseApiError(body, labels.failed))
            }
            const saved = responseSchema.parse(body).data
            setSecrets((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
            form.reset()
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (secret: DeploymentSecret, confirmation: string) => {
        setBusy(secret.id)
        setError(undefined)
        try {
            const response = await fetch(`/api/deployment-secrets/${secret.id}`, {
                body: JSON.stringify({ confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            setSecrets((current) => current.filter((item) => item.id !== secret.id))
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="deployment-secret-title">
            <header className="flex items-center justify-between p-3">
                <div>
                    <h2 id="deployment-secret-title" className="text-sm font-semibold">
                        {labels.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">{labels.valueNotice}</p>
                </div>
                <Badge variant="muted">{secrets.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            <form
                className="grid gap-3 border-t border-background p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                onSubmit={(event) => {
                    event.preventDefault()
                    void save(event.currentTarget)
                }}
            >
                <div className="grid gap-1">
                    <Label htmlFor="deployment-secret-reference">{labels.reference}</Label>
                    <Input id="deployment-secret-reference" name="reference" placeholder="apps/my-service/token" required />
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="deployment-secret-value">{labels.value}</Label>
                    <Input id="deployment-secret-value" name="value" type="password" autoComplete="new-password" required />
                </div>
                <Button type="submit" disabled={busy === 'save'}>
                    {labels.save}
                </Button>
            </form>
            {secrets.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background xl:grid-cols-2">
                {secrets.map((secret) => (
                    <Card key={secret.id} className="min-w-0 gap-3 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate font-mono text-sm">{secret.reference}</p>
                            <Badge variant="muted">
                                {labels.version} {secret.version}
                            </Badge>
                        </div>
                        <form
                            className="grid gap-1"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void remove(secret, String(new FormData(event.currentTarget).get('confirmation') ?? ''))
                            }}
                        >
                            <Label htmlFor={`deployment-secret-confirm-${secret.id}`}>{labels.confirmation}</Label>
                            <div className="flex min-w-0 gap-px">
                                <Input id={`deployment-secret-confirm-${secret.id}`} name="confirmation" className="min-w-0" />
                                <Button type="submit" disabled={busy === secret.id}>
                                    {labels.remove}
                                </Button>
                            </div>
                        </form>
                    </Card>
                ))}
            </div>
        </section>
    )
}
