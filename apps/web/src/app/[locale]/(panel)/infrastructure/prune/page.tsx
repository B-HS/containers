import { getTranslations } from 'next-intl/server'
import { getPrunePreview } from '@entities/infrastructure/infrastructure.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { PruneWidget } from '@widgets/prune/prune-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const PrunePage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const prunePreview = session.canManageApiKeys ? await getPrunePreview(API_INTERNAL_URL, session.cookie).catch(() => undefined) : undefined

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.prune')} title={navTranslations('items.prune')} />
            <PruneWidget
                initialPreview={prunePreview}
                role={session.session.role}
                labels={{
                    buildCache: translations('pruneBuildCache'),
                    confirmation: translations('pruneConfirmation'),
                    containers: translations('containers'),
                    execute: translations('pruneExecute'),
                    failed: translations('pruneFailed'),
                    images: translations('imageControl'),
                    includeVolumes: translations('pruneIncludeVolumes'),
                    networks: translations('networks'),
                    notice: translations('pruneNotice'),
                    preview: translations('prunePreview'),
                    protected: translations('pruneProtected'),
                    reclaimable: translations('pruneReclaimable'),
                    started: translations('pruneStarted'),
                    title: translations('pruneTitle'),
                    volumes: translations('volumes'),
                }}
            />
        </div>
    )
}

export default PrunePage
