'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { ManagedUser } from '@containers/contracts/user-management'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { WidgetSection } from '@shared/common/widget-section'

type UserWidgetProps = {
    currentUserId: string
    labels: {
        active: string
        apply: string
        disable: string
        disabled: string
        empty: string
        enable: string
        failed: string
        role: string
        title: string
    }
    users: ManagedUser[]
}

type UserCardProps = {
    busy: boolean
    currentUserId: string
    labels: UserWidgetProps['labels']
    onUpdate: (userId: string, input: { disabled?: boolean; role?: string }) => void
    user: ManagedUser
}

const UserCard: FC<UserCardProps> = ({ busy, currentUserId, labels, onUpdate, user }) => {
    const immutable = user.role === 'owner' || user.id === currentUserId
    const [role, setRole] = useState<string>(user.role)

    return (
        <Card className="min-w-0 gap-3 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="muted">{user.disabledAt ? labels.disabled : labels.active}</Badge>
            </div>
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    void onUpdate(user.id, { role })
                }}
            >
                <div className="grid min-w-40 flex-1 gap-1">
                    <Label htmlFor={`user-role-${user.id}`}>{labels.role}</Label>
                    <Select value={role} onValueChange={setRole} disabled={immutable}>
                        <SelectTrigger id={`user-role-${user.id}`} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {user.role === 'owner' ? <SelectItem value="owner">owner</SelectItem> : null}
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="operator">operator</SelectItem>
                            <SelectItem value="viewer">viewer</SelectItem>
                            <SelectItem value="auditor">auditor</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button type="submit" variant="default" disabled={immutable || busy}>
                    {labels.apply}
                </Button>
                <Button
                    type="button"
                    variant="default"
                    disabled={immutable || busy}
                    onClick={() => void onUpdate(user.id, { disabled: !user.disabledAt })}
                >
                    {user.disabledAt ? labels.enable : labels.disable}
                </Button>
            </form>
        </Card>
    )
}

export const UserWidget: FC<UserWidgetProps> = ({ currentUserId, labels, users }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()

    const update = async (userId: string, input: { disabled?: boolean; role?: string }) => {
        setBusy(userId)
        setError(undefined)
        try {
            const response = await fetch(`/api/users/${userId}`, {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'PATCH',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            window.location.reload()
        } catch (updateError) {
            setError(updateError instanceof Error ? updateError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="user-management-title" title={labels.title} badge={users.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {users.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background lg:grid-cols-2">
                {users.map((user) => (
                    <UserCard
                        key={user.id}
                        busy={busy === user.id}
                        currentUserId={currentUserId}
                        labels={labels}
                        onUpdate={(userId, input) => void update(userId, input)}
                        user={user}
                    />
                ))}
            </div>
        </WidgetSection>
    )
}
