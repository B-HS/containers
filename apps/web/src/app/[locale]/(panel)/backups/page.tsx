import { getTranslations } from 'next-intl/server'
import { getBackups } from '@entities/backup/backup.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { BackupWidget } from '@widgets/backup/backup-widget'

const BackupsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const backups = session.isOwner ? await getBackups(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.backups')} title={navTranslations('items.backups')} />
            <BackupWidget
                backups={backups}
                labels={{
                    confirmation: translations('backupConfirmation'),
                    create: translations('backupCreate'),
                    empty: translations('backupEmpty'),
                    failed: translations('backupFailed'),
                    label: translations('backupLabel'),
                    notice: translations('backupNotice'),
                    remove: translations('remove'),
                    restore: translations('backupRestore'),
                    restored: translations('backupRestored'),
                    size: translations('size'),
                    title: translations('backupControl'),
                }}
            />
        </div>
    )
}

export default BackupsPage
