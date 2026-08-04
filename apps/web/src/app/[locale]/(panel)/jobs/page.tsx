import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getBackupSchedule, getJobs } from '@entities/job/job.api'
import { getMaintenanceStatus } from '@entities/maintenance/maintenance.api'
import { API_INTERNAL_URL } from '@shared/lib/api-internal-url'
import { QUERY_KEY } from '@shared/lib/query-key'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { JobWidget } from '@widgets/job/job-widget'

const JobsPage = async () => {
    const [navTranslations, session] = await Promise.all([getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const queryClient = new QueryClient()
    if (session.canManageApiKeys) {
        await Promise.all([
            queryClient.prefetchQuery({ queryKey: QUERY_KEY.JOB.LIST, queryFn: () => getJobs(API_INTERNAL_URL, session.cookie) }),
            queryClient.prefetchQuery({
                queryKey: QUERY_KEY.JOB.BACKUP_SCHEDULE,
                queryFn: () => getBackupSchedule(API_INTERNAL_URL, session.cookie),
            }),
            queryClient.prefetchQuery({
                queryKey: QUERY_KEY.MAINTENANCE.STATUS,
                queryFn: () => getMaintenanceStatus(API_INTERNAL_URL, session.cookie),
            }),
        ])
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.jobs')} title={navTranslations('items.jobs')} />
                <JobWidget canManage={session.canManageApiKeys} />
            </div>
        </HydrationBoundary>
    )
}

export default JobsPage
