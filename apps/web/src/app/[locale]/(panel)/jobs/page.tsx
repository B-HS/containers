import { getTranslations } from 'next-intl/server'
import { getBackupSchedule, getJobs } from '@entities/job/job.api'
import { getMaintenanceStatus } from '@entities/maintenance/maintenance.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { JobWidget } from '@widgets/job/job-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const JobsPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const canManageApiKeys = session.canManageApiKeys
    const [jobs, backupSchedule, maintenanceStatus] = await Promise.all([
        canManageApiKeys ? getJobs(API_INTERNAL_URL, session.cookie).catch(() => []) : Promise.resolve([]),
        canManageApiKeys ? getBackupSchedule(API_INTERNAL_URL, session.cookie).catch(() => undefined) : Promise.resolve(undefined),
        canManageApiKeys ? getMaintenanceStatus(API_INTERNAL_URL, session.cookie).catch(() => undefined) : Promise.resolve(undefined),
    ])

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.jobs')} title={navTranslations('items.jobs')} />
            <JobWidget
                jobs={jobs}
                maintenance={maintenanceStatus}
                schedule={backupSchedule}
                labels={{
                    attempt: translations('jobAttempt'),
                    cancel: translations('jobCancel'),
                    cancelFailed: translations('jobCancelFailed'),
                    empty: translations('jobEmpty'),
                    finished: translations('jobFinished'),
                    interval: translations('jobInterval'),
                    lastFailure: translations('jobLastFailure'),
                    lastSuccess: translations('jobLastSuccess'),
                    maintenance: translations('jobMaintenance'),
                    nextRun: translations('jobNextRun'),
                    none: translations('jobNone'),
                    scheduled: translations('jobScheduled'),
                    title: translations('jobControl'),
                }}
            />
        </div>
    )
}

export default JobsPage
