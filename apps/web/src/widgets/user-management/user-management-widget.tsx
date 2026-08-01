'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { ManagedUser } from '@containers/contracts/user-management'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Label } from '@shared/ui/label'

type UserManagementWidgetProps = {
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

export const UserManagementWidget: FC<UserManagementWidgetProps> = ({ currentUserId, labels, users }) => {
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
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="user-management-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="user-management-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{users.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {users.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background lg:grid-cols-2">
                {users.map((user) => {
                    const immutable = user.role === 'owner' || user.id === currentUserId
                    return (
                        <Card key={user.id} className="min-w-0 gap-3 p-3">
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
                                    void update(user.id, { role: String(new FormData(event.currentTarget).get('role') ?? user.role) })
                                }}
                            >
                                <div className="grid min-w-40 flex-1 gap-1">
                                    <Label htmlFor={`user-role-${user.id}`}>{labels.role}</Label>
                                    <select
                                        id={`user-role-${user.id}`}
                                        name="role"
                                        className="h-9 bg-input px-3 text-sm"
                                        defaultValue={user.role}
                                        disabled={immutable}
                                    >
                                        {user.role === 'owner' ? <option value="owner">owner</option> : null}
                                        <option value="admin">admin</option>
                                        <option value="operator">operator</option>
                                        <option value="viewer">viewer</option>
                                        <option value="auditor">auditor</option>
                                    </select>
                                </div>
                                <Button type="submit" disabled={immutable || busy === user.id}>
                                    {labels.apply}
                                </Button>
                                <Button
                                    type="button"
                                    disabled={immutable || busy === user.id}
                                    onClick={() => void update(user.id, { disabled: !user.disabledAt })}
                                >
                                    {user.disabledAt ? labels.enable : labels.disable}
                                </Button>
                            </form>
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}
