'use client'

import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type AuthPanelProps = {
    labels: {
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
    mode: 'bootstrap' | 'login'
}

export const AuthPanel: FC<AuthPanelProps> = ({ labels, mode }) => {
    const [error, setError] = useState<string>()
    const [pending, setPending] = useState(false)

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(undefined)
        setPending(true)
        const formData = new FormData(event.currentTarget)
        const body = {
            email: String(formData.get('email') ?? ''),
            password: String(formData.get('password') ?? ''),
            ...(mode === 'bootstrap' ? { name: String(formData.get('name') ?? '') } : {}),
        }
        const endpoint = mode === 'bootstrap' ? '/api/bootstrap/owner' : '/api/auth/sign-in/email'

        try {
            const response = await fetch(endpoint, {
                body: JSON.stringify(body),
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.unknownError))
                return
            }

            window.location.reload()
        } catch {
            setError(labels.unknownError)
        } finally {
            setPending(false)
        }
    }

    const isBootstrap = mode === 'bootstrap'

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
                    <Button type="submit" disabled={pending}>
                        {pending ? labels.pending : isBootstrap ? labels.ownerAction : labels.loginAction}
                    </Button>
                </form>
            </Card>
        </main>
    )
}
