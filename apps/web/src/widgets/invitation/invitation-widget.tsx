'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useCreateInvitation } from '@entities/invitation/invitation.query'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { WidgetSection } from '@shared/common/widget-section'

const INVITATION_ROLES = ['admin', 'operator', 'viewer', 'auditor']

type InvitationWidgetProps = {
    role: string
}

export const InvitationWidget: FC<InvitationWidgetProps> = ({ role }) => {
    const [invitationUrl, setInvitationUrl] = useState<string>()
    const [selectedRole, setSelectedRole] = useState('admin')
    const t = useTranslations('Dashboard')
    const createInvitation = useCreateInvitation()

    const create = (form: HTMLFormElement) => {
        const formData = new FormData(form)
        setInvitationUrl(undefined)
        createInvitation.mutate(
            {
                email: String(formData.get('email') ?? ''),
                expiresInHours: Number(formData.get('expiresInHours')),
                role: selectedRole,
            },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('invitationFailed')),
                onSuccess: (data) => {
                    setInvitationUrl(data.invitationUrl)
                    toast.success(t('invitationCreated'))
                },
            },
        )
    }

    const copy = async (value: string) => {
        await navigator.clipboard.writeText(value)
        toast.success(t('copied'))
    }

    if (!['owner', 'admin'].includes(role)) {
        return null
    }

    return (
        <WidgetSection id="invitation-control-title" title={t('invitationControl')}>
            <form
                className="grid gap-4 bg-surface-1 p-6 sm:grid-cols-[minmax(0,1fr)_160px_140px_auto] sm:items-end"
                onSubmit={(event) => {
                    event.preventDefault()
                    create(event.currentTarget)
                }}
            >
                <div className="grid gap-2">
                    <Label htmlFor="invitation-email">{t('invitationEmail')}</Label>
                    <Input id="invitation-email" name="email" type="email" required />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="invitation-role">{t('invitationRole')}</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                        <SelectTrigger id="invitation-role" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {INVITATION_ROLES.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {item}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="invitation-expires">{t('invitationExpires')}</Label>
                    <Input id="invitation-expires" name="expiresInHours" type="number" min="1" max="168" defaultValue="24" required />
                </div>
                <Button type="submit" disabled={createInvitation.isPending}>
                    {t('createInvitation')}
                </Button>
            </form>
            {invitationUrl ? (
                <Alert variant="warning" className="m-4 w-auto">
                    <AlertTitle>{t('invitationLink')}</AlertTitle>
                    <AlertDescription>
                        <p>{t('invitationWarning')}</p>
                        <div className="mt-2 flex w-full min-w-0 items-center gap-2">
                            <Input
                                aria-label={t('invitationLink')}
                                className="min-w-0 flex-1 font-mono text-xs"
                                readOnly
                                value={invitationUrl}
                                onFocus={(event) => event.currentTarget.select()}
                            />
                            <Button type="button" size="sm" variant="outline" onClick={() => void copy(invitationUrl)}>
                                <CopyIcon />
                                {t('copy')}
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            ) : null}
        </WidgetSection>
    )
}
