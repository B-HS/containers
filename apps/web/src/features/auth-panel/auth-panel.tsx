'use client'

import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type AuthPanelLabels = {
    email: string
    loginAction: string
    loginDescription: string
    loginTitle: string
    name: string
    ownerAction: string
    ownerDescription: string
    ownerTitle: string
    password: string
    pending: string
    unknownError: string
}

type AuthPanelProps = {
    labels: AuthPanelLabels
    mode: 'bootstrap' | 'login'
    onAuthenticate: (input: { email: string; mode: 'bootstrap' | 'login'; name?: string | undefined; password: string }) => Promise<void>
}

export type { AuthPanelLabels }

export const AuthPanel: FC<AuthPanelProps> = ({ labels, mode, onAuthenticate }) => {
    const [error, setError] = useState<string>()
    const [pending, setPending] = useState(false)
    const isBootstrap = mode === 'bootstrap'

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(undefined)
        setPending(true)
        const formData = new FormData(event.currentTarget)
        const email = String(formData.get('email') ?? '')
        const password = String(formData.get('password') ?? '')
        const name = isBootstrap ? String(formData.get('name') ?? '') : undefined

        try {
            await onAuthenticate({ email, mode, name, password })
        } catch {
            setError(labels.unknownError)
        } finally {
            setPending(false)
        }
    }

    return (
        <main className="grid min-h-screen place-items-center bg-background p-3 text-foreground">
            <Card className="w-full max-w-md gap-6 p-6">
                <header>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Containers</p>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight">{isBootstrap ? labels.ownerTitle : labels.loginTitle}</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{isBootstrap ? labels.ownerDescription : labels.loginDescription}</p>
                </header>
                <form className="grid gap-4" onSubmit={submit}>
                    {isBootstrap ? (
                        <div className="grid gap-2">
                            <Label htmlFor="name">{labels.name}</Label>
                            <Input id="name" name="name" autoComplete="name" maxLength={100} required />
                        </div>
                    ) : null}
                    <div className="grid gap-2">
                        <Label htmlFor="email">{labels.email}</Label>
                        <Input id="email" name="email" autoComplete="email" inputMode="email" type="email" required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">{labels.password}</Label>
                        <Input
                            id="password"
                            name="password"
                            autoComplete={isBootstrap ? 'new-password' : 'current-password'}
                            minLength={12}
                            maxLength={128}
                            type="password"
                            required
                        />
                    </div>
                    {error ? (
                        <p className="bg-muted p-3 text-sm" role="alert">
                            {error}
                        </p>
                    ) : null}
                    <Button type="submit" variant="default" disabled={pending}>
                        {pending ? labels.pending : isBootstrap ? labels.ownerAction : labels.loginAction}
                    </Button>
                </form>
            </Card>
        </main>
    )
}
