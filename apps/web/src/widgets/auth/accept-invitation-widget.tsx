'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAcceptInvitation } from '@entities/auth/auth.query'
import { AcceptInvitationPanel } from '@features/accept-invitation-panel/accept-invitation-panel'
import type { AcceptInvitationPanelLabels } from '@features/accept-invitation-panel/accept-invitation-panel'

type AcceptInvitationWidgetProps = {
    labels: AcceptInvitationPanelLabels
    locale: string
    token: string
}

export const AcceptInvitationWidget: FC<AcceptInvitationWidgetProps> = ({ labels, locale, token }) => {
    const t = useTranslations('Invitation')
    const router = useRouter()
    const acceptInvitation = useAcceptInvitation()

    const accept = async (input: { name: string; password: string }) => {
        await acceptInvitation.mutateAsync({ ...input, token })
        toast.success(t('accepted'))
        router.replace(`/${locale}`)
        router.refresh()
    }

    return <AcceptInvitationPanel labels={labels} onAccept={accept} />
}
