'use client'

import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Spinner } from '@shared/ui/spinner'

type AcceptInvitationPanelLabels = {
    action: string
    description: string
    failed: string
    name: string
    password: string
    pending: string
    title: string
}

type AcceptInvitationPanelProps = {
    labels: AcceptInvitationPanelLabels
    onAccept: (input: { name: string; password: string }) => Promise<void>
}

export type { AcceptInvitationPanelLabels }

export const AcceptInvitationPanel: FC<AcceptInvitationPanelProps> = ({ labels, onAccept }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setBusy(true)
        setError(undefined)
        const form = new FormData(event.currentTarget)

        try {
            await onAccept({ name: String(form.get('name') ?? ''), password: String(form.get('password') ?? '') })
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
            <Card className="w-full max-w-md gap-6 py-8">
                <CardHeader className="gap-3">
                    <p className="text-xs font-medium tracking-[0.18em] text-text-subtle uppercase">Containers</p>
                    <CardTitle className="text-2xl tracking-tight">{labels.title}</CardTitle>
                    <CardDescription className="leading-6">{labels.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-5" onSubmit={submit}>
                        <div className="grid gap-2">
                            <Label htmlFor="accept-name">{labels.name}</Label>
                            <Input id="accept-name" name="name" autoComplete="name" maxLength={100} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="accept-password">{labels.password}</Label>
                            <Input
                                id="accept-password"
                                name="password"
                                autoComplete="new-password"
                                type="password"
                                minLength={12}
                                maxLength={128}
                                required
                            />
                        </div>
                        {error ? (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}
                        <Button type="submit" variant="default" disabled={busy}>
                            {busy ? <Spinner /> : null}
                            {busy ? labels.pending : labels.action}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    )
}
