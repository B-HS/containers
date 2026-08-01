'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type InvitationControlWidgetProps = {
    labels: {
        copy: string
        create: string
        email: string
        expires: string
        failed: string
        link: string
        role: string
        title: string
        warning: string
    }
    role: string
}

export const InvitationControlWidget: FC<InvitationControlWidgetProps> = ({ labels, role }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [invitationUrl, setInvitationUrl] = useState<string>()

    if (!['owner', 'admin'].includes(role)) {
        return null
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="invitation-control-title">
            <header className="p-3">
                <h2 id="invitation-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
            </header>
            <Card className="gap-3 p-3">
                <form
                    className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_120px_auto] sm:items-end"
                    onSubmit={async (event) => {
                        event.preventDefault()
                        setBusy(true)
                        setError(undefined)
                        setInvitationUrl(undefined)
                        const form = new FormData(event.currentTarget)

                        try {
                            const response = await fetch('/api/invitations', {
                                body: JSON.stringify({
                                    email: String(form.get('email') ?? ''),
                                    expiresInHours: Number(form.get('expiresInHours')),
                                    role: String(form.get('role') ?? ''),
                                }),
                                headers: { 'content-type': 'application/json' },
                                method: 'POST',
                            })
                            const body = await response.json()

                            if (!response.ok) {
                                setError(parseApiError(body, labels.failed))
                                return
                            }

                            if (
                                body &&
                                typeof body === 'object' &&
                                'data' in body &&
                                body.data &&
                                typeof body.data === 'object' &&
                                'invitationUrl' in body.data
                            ) {
                                setInvitationUrl(String(body.data.invitationUrl))
                            }
                        } catch {
                            setError(labels.failed)
                        } finally {
                            setBusy(false)
                        }
                    }}
                >
                    <div className="grid gap-2">
                        <Label htmlFor="invitation-email">{labels.email}</Label>
                        <Input id="invitation-email" name="email" type="email" required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="invitation-role">{labels.role}</Label>
                        <select id="invitation-role" name="role" className="h-9 bg-background px-3 text-sm">
                            <option value="admin">admin</option>
                            <option value="operator">operator</option>
                            <option value="viewer">viewer</option>
                            <option value="auditor">auditor</option>
                        </select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="invitation-expires">{labels.expires}</Label>
                        <Input id="invitation-expires" name="expiresInHours" type="number" min="1" max="168" defaultValue="24" required />
                    </div>
                    <Button type="submit" disabled={busy}>
                        {labels.create}
                    </Button>
                </form>
                {error ? (
                    <p className="bg-red-950 p-3 text-sm text-red-100" role="alert">
                        {error}
                    </p>
                ) : null}
                {invitationUrl ? (
                    <div className="grid gap-2">
                        <Label htmlFor="invitation-url">{labels.link}</Label>
                        <div className="flex min-w-0 gap-px">
                            <Input id="invitation-url" value={invitationUrl} readOnly className="min-w-0 font-mono" />
                            <Button type="button" onClick={() => void navigator.clipboard.writeText(invitationUrl)}>
                                {labels.copy}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{labels.warning}</p>
                    </div>
                ) : null}
            </Card>
        </section>
    )
}
