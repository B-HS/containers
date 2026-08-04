import { getTranslations } from 'next-intl/server'
import { getImages } from '@entities/image/image.api'
import { getInfrastructure } from '@entities/infrastructure/infrastructure.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ContainerCreateWidget } from '@widgets/container/container-create-widget'

const ContainerCreatePage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const [images, infrastructure] = await Promise.all([
        getImages(API_INTERNAL_URL, session.cookie).catch(() => []),
        getInfrastructure(API_INTERNAL_URL, session.cookie).catch(() => ({ networks: [], volumes: [] })),
    ])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.containersNew')} title={navTranslations('items.containersNew')} />
            <ContainerCreateWidget
                images={images}
                networks={infrastructure.networks}
                role={session.session.role}
                labels={{
                    autoStart: translations('containerAutoStart'),
                    command: translations('command'),
                    cpu: translations('containerCpu'),
                    create: translations('create'),
                    failed: translations('containerCreateFailed'),
                    image: translations('image'),
                    memory: translations('containerMemory'),
                    name: translations('containerName'),
                    network: translations('containerNetwork'),
                    port: translations('containerPort'),
                    readOnly: translations('containerReadOnly'),
                    title: translations('containerCreate'),
                }}
            />
        </div>
    )
}

export default ContainerCreatePage
