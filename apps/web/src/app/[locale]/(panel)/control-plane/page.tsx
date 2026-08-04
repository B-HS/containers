import { getTranslations } from 'next-intl/server'
import { getControlPlaneStatus } from '@entities/control-plane/control-plane.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ControlPlaneWidget } from '@widgets/control-plane/control-plane-widget'

const ControlPlanePage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const status = session.canManageApiKeys ? await getControlPlaneStatus(API_INTERNAL_URL, session.cookie).catch(() => undefined) : undefined

    if (!status) {
        return (
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.controlPlane')} title={navTranslations('items.controlPlane')} />
            </div>
        )
    }

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.controlPlane')} title={navTranslations('items.controlPlane')} />
            <ControlPlaneWidget
                status={status}
                labels={{
                    activeJobs: translations('activeJobs'),
                    applied: translations('applied'),
                    databaseIntegrity: translations('databaseIntegrity'),
                    lastBackup: translations('lastBackup'),
                    maintenance: translations('maintenance'),
                    none: translations('none'),
                    pending: translations('pending'),
                    title: translations('title'),
                    version: translations('version'),
                }}
            />
        </div>
    )
}

export default ControlPlanePage
