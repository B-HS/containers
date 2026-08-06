import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getRegistryCredentials } from '@entities/registry/registry.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { RegistryWidget } from '@widgets/registry/registry-widget'

const RegistryPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: QUERY_KEY.REGISTRY.LIST,
        queryFn: () => (session.canManageApiKeys ? getRegistryCredentials(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([])),
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.registry')} title={navTranslations('items.registry')} />
                <RegistryWidget
                    role={session.session.role}
                    labels={{
                        cancel: translations('cancel'),
                        confirmation: translations('registryConfirmation'),
                        confirmationMismatch: translations('confirmationMismatch'),
                        confirmRemoveTitle: translations('confirmRemoveTitle'),
                        created: translations('created'),
                        credential: translations('registryCredential'),
                        credentialCreate: translations('registryCredentialCreate'),
                        empty: translations('registryEmpty'),
                        emptyDescription: translations('registryEmptyDescription'),
                        failed: translations('registryFailed'),
                        name: translations('registryName'),
                        notice: translations('registryNotice'),
                        password: translations('registryPassword'),
                        publicCredential: translations('registryPublic'),
                        pull: translations('registryPull'),
                        pullReference: translations('registryPullReference'),
                        remove: translations('remove'),
                        removed: translations('removed'),
                        removeImpact: translations('registryRemoveImpact'),
                        rotate: translations('registryRotate'),
                        rotated: translations('registryRotated'),
                        save: translations('registrySave'),
                        serverAddress: translations('registryServerAddress'),
                        started: translations('registryStarted'),
                        title: translations('registryTitle'),
                        username: translations('registryUsername'),
                        version: translations('registryVersion'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default RegistryPage
