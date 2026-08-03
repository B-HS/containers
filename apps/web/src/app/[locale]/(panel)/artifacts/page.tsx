import { getTranslations } from 'next-intl/server'
import { getArtifacts } from '@entities/artifact/artifact.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ArtifactWidget } from '@widgets/artifact/artifact-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const ArtifactsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const artifacts = await getArtifacts(API_INTERNAL_URL, session.cookie).catch(() => [])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.artifacts')} title={navTranslations('items.artifacts')} />
            <ArtifactWidget
                artifacts={artifacts}
                role={session.session.role}
                labels={{
                    artifactType: translations('artifactType'),
                    checksum: translations('checksum'),
                    empty: translations('artifactEmpty'),
                    failed: translations('uploadFailed'),
                    file: translations('file'),
                    load: translations('loadImage'),
                    loading: translations('loading'),
                    progress: translations('uploadProgress'),
                    title: translations('artifactControl'),
                    upload: translations('upload'),
                    uploading: translations('uploading'),
                    storageWarning: translations('uploadStorageWarning'),
                }}
            />
        </div>
    )
}

export default ArtifactsPage
