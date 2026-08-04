import { getTranslations } from 'next-intl/server'
import { getRegistryCredentials } from '@entities/infrastructure/infrastructure.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { RegistryWidget } from '@widgets/registry/registry-widget'

const RegistryPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const credentials = session.canManageApiKeys ? await getRegistryCredentials(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.registry')} title={navTranslations('items.registry')} />
            <RegistryWidget
                credentials={credentials}
                role={session.session.role}
                labels={{
                    confirmation: translations('registryConfirmation'),
                    credential: translations('registryCredential'),
                    empty: translations('registryEmpty'),
                    failed: translations('registryFailed'),
                    name: translations('registryName'),
                    notice: translations('registryNotice'),
                    password: translations('registryPassword'),
                    publicCredential: translations('registryPublic'),
                    pull: translations('registryPull'),
                    pullReference: translations('registryPullReference'),
                    remove: translations('remove'),
                    rotate: translations('registryRotate'),
                    save: translations('registrySave'),
                    serverAddress: translations('registryServerAddress'),
                    started: translations('registryStarted'),
                    title: translations('registryTitle'),
                    username: translations('registryUsername'),
                    version: translations('registryVersion'),
                }}
            />
        </div>
    )
}

export default RegistryPage
