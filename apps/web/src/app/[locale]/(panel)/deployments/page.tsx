import { getTranslations } from 'next-intl/server'
import { getImages } from '@entities/image/image.api'
import { getInfrastructure } from '@entities/infrastructure/infrastructure.api'
import { getDeploymentManifests, getDeploymentReleases } from '@entities/deployment/deployment.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { DeploymentWidget } from '@widgets/deployment/deployment-widget'

const DeploymentsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const [images, manifests, networks, releases] = await Promise.all([
        getImages(API_INTERNAL_URL, session.cookie).catch(() => []),
        getDeploymentManifests(API_INTERNAL_URL, session.cookie).catch(() => []),
        getInfrastructure(API_INTERNAL_URL, session.cookie).catch(() => ({ networks: [], volumes: [] })),
        getDeploymentReleases(API_INTERNAL_URL, session.cookie).catch(() => []),
    ])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.deployments')} title={navTranslations('items.deployments')} />
            <DeploymentWidget
                images={images}
                manifests={manifests}
                networks={networks.networks}
                releases={releases}
                role={session.session.role}
                labels={{
                    command: translations('command'),
                    cpu: translations('containerCpu'),
                    create: translations('deploymentManifestCreate'),
                    deploy: translations('deploymentReleaseStart'),
                    deploying: translations('deploymentReleaseStarting'),
                    empty: translations('deploymentEmpty'),
                    failed: translations('deploymentFailed'),
                    healthPath: translations('deploymentHealthPath'),
                    hostname: translations('nginxRouteHostname'),
                    image: translations('image'),
                    manifest: translations('deploymentManifest'),
                    memory: translations('containerMemory'),
                    name: translations('containerName'),
                    network: translations('containerNetwork'),
                    observation: translations('deploymentObservation'),
                    path: translations('nginxRoutePath'),
                    port: translations('containerPort'),
                    recentAuth: translations('deploymentRecentAuth'),
                    release: translations('deploymentRelease'),
                    rollback: translations('deploymentRollback'),
                    rollingBack: translations('deploymentRollingBack'),
                    secretBindings: translations('deploymentSecretBindings'),
                    status: translations('state'),
                    title: translations('deploymentControl'),
                    version: translations('deploymentVersion'),
                }}
            />
        </div>
    )
}

export default DeploymentsPage
