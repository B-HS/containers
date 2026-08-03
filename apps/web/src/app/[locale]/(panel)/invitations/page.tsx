import { getTranslations } from 'next-intl/server'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { InvitationWidget } from '@widgets/invitation/invitation-widget'

const InvitationsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.invitations')} title={navTranslations('items.invitations')} />
            <InvitationWidget
                role={session.session.role}
                labels={{
                    copy: translations('copy'),
                    create: translations('createInvitation'),
                    email: translations('invitationEmail'),
                    expires: translations('invitationExpires'),
                    failed: translations('invitationFailed'),
                    link: translations('invitationLink'),
                    role: translations('invitationRole'),
                    title: translations('invitationControl'),
                    warning: translations('invitationWarning'),
                }}
            />
        </div>
    )
}

export default InvitationsPage
