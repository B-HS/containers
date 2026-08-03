import { getTranslations } from 'next-intl/server'
import { getManagedUsers } from '@entities/user/user.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { UserWidget } from '@widgets/user/user-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const UsersPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const users = session.isOwner ? await getManagedUsers(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.users')} title={navTranslations('items.users')} />
            <UserWidget
                currentUserId={session.session.user.id}
                users={users}
                labels={{
                    active: translations('userActive'),
                    apply: translations('applyRole'),
                    disable: translations('disableUser'),
                    disabled: translations('userDisabled'),
                    empty: translations('userEmpty'),
                    enable: translations('enableUser'),
                    failed: translations('userManagementFailed'),
                    role: translations('invitationRole'),
                    title: translations('userManagement'),
                }}
            />
        </div>
    )
}

export default UsersPage
