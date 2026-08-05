import { getTranslations } from 'next-intl/server'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { TrustedProxyWidget } from '@widgets/trusted-proxy/trusted-proxy-widget'

const TrustedProxyPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.trustedProxies')} title={navTranslations('items.trustedProxies')} />
            <TrustedProxyWidget canManage={session.isOwner} />
        </div>
    )
}

export default TrustedProxyPage
