import { getTranslations } from 'next-intl/server'
import { getNginxConfig } from '@entities/nginx/nginx.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { NginxConfigWidget } from '@widgets/nginx/nginx-config-widget'

const NginxPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const nginxConfig = await getNginxConfig(API_INTERNAL_URL, session.cookie).catch(() => undefined)

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.nginx')} title={navTranslations('items.nginx')} />
            <NginxConfigWidget
                role={session.session.role}
                state={nginxConfig}
                labels={{
                    apply: translations('applyNginx'),
                    applying: translations('applyingNginx'),
                    failed: translations('nginxConfigFailed'),
                    history: translations('revisionHistory'),
                    protectedNotice: translations('nginxProtectedNotice'),
                    sha256: translations('checksum'),
                    success: translations('nginxApplied'),
                    title: translations('nginxConfig'),
                }}
            />
        </div>
    )
}

export default NginxPage
