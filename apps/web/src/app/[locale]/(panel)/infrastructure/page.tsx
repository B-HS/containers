import { getTranslations } from 'next-intl/server'
import { getInfrastructure } from '@entities/infrastructure/infrastructure.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { InfrastructureWidget } from '@widgets/infrastructure/infrastructure-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const InfrastructurePage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const infrastructure = await getInfrastructure(API_INTERNAL_URL, session.cookie).catch(() => ({ networks: [], volumes: [] }))

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.infrastructure')} title={navTranslations('items.infrastructure')} />
            <InfrastructureWidget
                networks={infrastructure.networks}
                role={session.session.role}
                volumes={infrastructure.volumes}
                labels={{
                    confirmation: translations('infrastructureConfirmation'),
                    containers: translations('containers'),
                    create: translations('create'),
                    driver: translations('infrastructureDriver'),
                    empty: translations('infrastructureEmpty'),
                    failed: translations('infrastructureFailed'),
                    force: translations('force'),
                    gateway: translations('gateway'),
                    internal: translations('internalNetwork'),
                    networks: translations('networks'),
                    networkName: translations('networkName'),
                    remove: translations('remove'),
                    size: translations('size'),
                    subnet: translations('subnet'),
                    title: translations('infrastructureControl'),
                    volumes: translations('volumes'),
                    volumeName: translations('volumeName'),
                }}
            />
        </div>
    )
}

export default InfrastructurePage
