import { getTranslations } from 'next-intl/server'
import { getApiKeys } from '@entities/api-key/api-key.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ApiKeyWidget } from '@widgets/api-key/api-key-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const ApiKeysPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const apiKeys = session.canManageApiKeys ? await getApiKeys(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.apiKeys')} title={navTranslations('items.apiKeys')} />
            <ApiKeyWidget
                apiKeys={apiKeys}
                labels={{
                    create: translations('createApiKey'),
                    createdToken: translations('createdToken'),
                    empty: translations('apiKeyEmpty'),
                    expires: translations('expiresInDays'),
                    failed: translations('apiKeyFailed'),
                    name: translations('apiKeyName'),
                    revoke: translations('revoke'),
                    scopes: translations('scopes'),
                    title: translations('apiKeyControl'),
                    tokenWarning: translations('tokenWarning'),
                }}
            />
        </div>
    )
}

export default ApiKeysPage
