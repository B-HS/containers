'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ManagedUser } from '@containers/contracts/user-management'
import { ConfirmActionDialog } from '@features/confirm-action-dialog/confirm-action-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip'

const ASSIGNABLE_ROLES = ['admin', 'operator', 'viewer', 'auditor']

type UserCardProps = {
    currentUserId: string
    onUpdate: (userId: string, input: { disabled?: boolean; role?: string }) => void
    pending: boolean
    user: ManagedUser
}

export const UserCard: FC<UserCardProps> = ({ currentUserId, onUpdate, pending, user }) => {
    const [role, setRole] = useState<string>(user.role)
    const t = useTranslations('Dashboard')
    const lockedReasons = [...(user.role === 'owner' ? [t('userOwnerLocked')] : []), ...(user.id === currentUserId ? [t('userSelfLocked')] : [])]
    const lockedReason = lockedReasons[0]
    const immutable = lockedReason !== undefined

    return (
        <div className="grid min-w-0 gap-4 bg-surface-1 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-strong">{user.name}</p>
                    <p className="truncate text-xs text-text-muted">{user.email}</p>
                </div>
                <Badge variant={user.disabledAt ? 'danger' : 'neutral'}>{user.disabledAt ? t('userDisabled') : t('userActive')}</Badge>
            </div>
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    onUpdate(user.id, { role })
                }}
            >
                <div className="grid min-w-40 flex-1 gap-2">
                    <Label htmlFor={`user-role-${user.id}`}>{t('invitationRole')}</Label>
                    <Select value={role} onValueChange={setRole} disabled={immutable}>
                        <SelectTrigger id={`user-role-${user.id}`} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {user.role === 'owner' ? <SelectItem value="owner">owner</SelectItem> : null}
                            {ASSIGNABLE_ROLES.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {item}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {immutable ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-flex">
                                    <Button type="button" variant="outline" disabled>
                                        {t('applyRole')}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{lockedReason}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Button type="submit" variant="outline" disabled={pending || role === user.role}>
                        {t('applyRole')}
                    </Button>
                )}
                {!immutable && user.disabledAt ? (
                    <Button type="button" variant="outline" disabled={pending} onClick={() => onUpdate(user.id, { disabled: false })}>
                        {t('enableUser')}
                    </Button>
                ) : null}
                {!immutable && !user.disabledAt ? (
                    <ConfirmActionDialog
                        confirmLabel={t('disableUser')}
                        description={t('userDisableDescription')}
                        impact={user.email}
                        onConfirm={() => onUpdate(user.id, { disabled: true })}
                        pending={pending}
                        target={user.name}
                        title={t('userDisableTitle')}
                        trigger={
                            <Button type="button" variant="destructive" disabled={pending}>
                                {t('disableUser')}
                            </Button>
                        }
                    />
                ) : null}
            </form>
        </div>
    )
}
