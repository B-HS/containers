import { getTranslations } from 'next-intl/server'
import { getDeploymentSecrets } from '@entities/deployment/deployment-secret.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { DeploymentSecretWidget } from '@widgets/deployment/deployment-secret-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const DeploymentSecretsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const secrets = session.canManageSecrets ? await getDeploymentSecrets(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.deploymentSecrets')} title={navTranslations('items.deploymentSecrets')} />
            <DeploymentSecretWidget
                secrets={secrets}
                labels={{
                    confirmation: translations('deploymentSecretConfirmation'),
                    empty: translations('deploymentSecretEmpty'),
                    failed: translations('deploymentSecretFailed'),
                    reference: translations('deploymentSecretReference'),
                    remove: translations('remove'),
                    save: translations('deploymentSecretSave'),
                    title: translations('deploymentSecretControl'),
                    value: translations('deploymentSecretValue'),
                    valueNotice: translations('deploymentSecretValueNotice'),
                    version: translations('deploymentVersion'),
                }}
            />
        </div>
    )
}

export default DeploymentSecretsPage
