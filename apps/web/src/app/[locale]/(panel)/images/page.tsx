import { getTranslations } from 'next-intl/server'
import { getImages } from '@entities/image/image.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ImageWidget } from '@widgets/image/image-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const ImagesPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const images = await getImages(API_INTERNAL_URL, session.cookie).catch(() => [])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.images')} title={navTranslations('items.images')} />
            <ImageWidget
                images={images}
                role={session.session.role}
                labels={{
                    confirmation: translations('imageRemoveConfirmation'),
                    empty: translations('imageEmpty'),
                    failed: translations('imageActionFailed'),
                    force: translations('force'),
                    remove: translations('remove'),
                    size: translations('size'),
                    title: translations('imageControl'),
                }}
            />
        </div>
    )
}

export default ImagesPage
