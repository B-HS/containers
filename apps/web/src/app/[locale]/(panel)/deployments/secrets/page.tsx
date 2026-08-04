import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getDeploymentSecrets } from '@entities/deployment/deployment-secret.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { DeploymentSecretWidget } from '@widgets/deployment/deployment-secret-widget'

const DeploymentSecretsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    const secrets = await queryClient.fetchQuery({
        queryKey: QUERY_KEY.DEPLOYMENT.SECRET.LIST,
        queryFn: () => (session.canManageSecrets ? getDeploymentSecrets(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([])),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
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
        </HydrationBoundary>
    )
}

export default DeploymentSecretsPage
