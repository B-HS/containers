import { getTranslations } from 'next-intl/server'
import { getAuditEvents } from '@entities/audit/audit.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { AuditWidget } from '@widgets/audit/audit-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const AuditPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const events = session.canViewAudit ? await getAuditEvents(API_INTERNAL_URL, session.cookie).catch(() => []) : []

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.audit')} title={navTranslations('items.audit')} />
            <AuditWidget
                events={events}
                labels={{
                    actor: translations('auditActor'),
                    empty: translations('auditEmpty'),
                    filter: translations('auditFilter'),
                    operation: translations('auditOperation'),
                    result: translations('auditResult'),
                    target: translations('auditTarget'),
                    title: translations('auditLog'),
                }}
            />
        </div>
    )
}

export default AuditPage
