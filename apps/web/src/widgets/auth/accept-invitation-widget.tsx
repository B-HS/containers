'use client'

import type { FC } from 'react'
import { useAcceptInvitation } from '@entities/auth/auth.query'
import { AcceptInvitationPanel } from '@features/accept-invitation-panel/accept-invitation-panel'
import type { AcceptInvitationPanelLabels } from '@features/accept-invitation-panel/accept-invitation-panel'

type AcceptInvitationWidgetProps = {
    labels: AcceptInvitationPanelLabels
    locale: string
    token: string
}

export const AcceptInvitationWidget: FC<AcceptInvitationWidgetProps> = ({ labels, locale, token }) => {
    const acceptInvitation = useAcceptInvitation()

    const accept = async (input: { name: string; password: string; token: string }) => {
        await acceptInvitation.mutateAsync(input)
    }

    return <AcceptInvitationPanel labels={labels} locale={locale} onAccept={accept} token={token} />
}
