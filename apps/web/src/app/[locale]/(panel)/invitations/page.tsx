import { getTranslations } from 'next-intl/server'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { InvitationWidget } from '@widgets/invitation/invitation-widget'

const InvitationsPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.invitations')} title={navTranslations('items.invitations')} />
            <InvitationWidget role={session.session.role} />
        </div>
    )
}

export default InvitationsPage
