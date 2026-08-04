'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useCreateInvitation } from '@entities/invitation/invitation.query'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { WidgetSection } from '@shared/common/widget-section'

type InvitationWidgetProps = {
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

export const InvitationWidget: FC<InvitationWidgetProps> = ({ labels, role }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [invitationUrl, setInvitationUrl] = useState<string>()
    const [selectedRole, setSelectedRole] = useState('admin')
    const createInvitation = useCreateInvitation()

    if (!['owner', 'admin'].includes(role)) {
        return null
    }

    return (
        <WidgetSection id="invitation-control-title" title={labels.title}>
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
                            const data = await createInvitation.mutateAsync({
                                email: String(form.get('email') ?? ''),
                                expiresInHours: Number(form.get('expiresInHours')),
                                role: selectedRole,
                            })
                            setInvitationUrl(data.invitationUrl)
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
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger id="invitation-role" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">admin</SelectItem>
                                <SelectItem value="operator">operator</SelectItem>
                                <SelectItem value="viewer">viewer</SelectItem>
                                <SelectItem value="auditor">auditor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="invitation-expires">{labels.expires}</Label>
                        <Input id="invitation-expires" name="expiresInHours" type="number" min="1" max="168" defaultValue="24" required />
                    </div>
                    <Button type="submit" variant="default" disabled={busy}>
                        {labels.create}
                    </Button>
                </form>
                {error ? (
                    <InlineAlert role="alert" tone="error" className="mx-0 mb-0">
                        {error}
                    </InlineAlert>
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
        </WidgetSection>
    )
}
