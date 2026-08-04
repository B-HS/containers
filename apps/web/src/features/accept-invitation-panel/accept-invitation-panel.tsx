'use client'

import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { useAcceptInvitation } from '@entities/auth/auth.query'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type AcceptInvitationPanelProps = {
    labels: {
        action: string
        description: string
        failed: string
        name: string
        password: string
        pending: string
        title: string
    }
    locale: string
    token: string
}

export const AcceptInvitationPanel: FC<AcceptInvitationPanelProps> = ({ labels, locale, token }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const acceptInvitation = useAcceptInvitation()

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setBusy(true)
        setError(undefined)
        const form = new FormData(event.currentTarget)

        try {
            await acceptInvitation.mutateAsync({
                name: String(form.get('name') ?? ''),
                password: String(form.get('password') ?? ''),
                token,
            })
            window.location.assign(`/${locale}`)
        } catch {
            setError(labels.failed)
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="grid min-h-screen place-items-center bg-background p-3 text-foreground">
            <Card className="w-full max-w-md gap-6 p-6">
                <header>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Containers</p>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight">{labels.title}</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{labels.description}</p>
                </header>
                <form className="grid gap-4" onSubmit={submit}>
                    <div className="grid gap-2">
                        <Label htmlFor="accept-name">{labels.name}</Label>
                        <Input id="accept-name" name="name" maxLength={100} required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="accept-password">{labels.password}</Label>
                        <Input id="accept-password" name="password" type="password" minLength={12} maxLength={128} required />
                    </div>
                    {error ? (
                        <p className="bg-red-950 p-3 text-sm text-red-100" role="alert">
                            {error}
                        </p>
                    ) : null}
                    <Button type="submit" variant="default" disabled={busy}>
                        {busy ? labels.pending : labels.action}
                    </Button>
                </form>
            </Card>
        </main>
    )
}
