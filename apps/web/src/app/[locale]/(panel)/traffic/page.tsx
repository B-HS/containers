import { getTranslations } from 'next-intl/server'
import { getTrafficAnalytics } from '@entities/traffic/traffic.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { TrafficWidget } from '@widgets/traffic/traffic-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const TrafficPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const analytics = await getTrafficAnalytics(API_INTERNAL_URL, session.cookie).catch(() => undefined)

    return (
        <div className="grid gap-px">
            <PageHeader description={navTranslations('subtitles.traffic')} title={navTranslations('items.traffic')} />
            <TrafficWidget
                analytics={analytics}
                canExport={session.canManageApiKeys}
                labels={{
                    average: translations('trafficAverage'),
                    bytes: translations('trafficBytes'),
                    empty: translations('trafficEmpty'),
                    errorRate: translations('trafficErrorRate'),
                    latency: translations('trafficLatency'),
                    maskedIp: translations('trafficMaskedIp'),
                    path: translations('trafficPath'),
                    pause: translations('trafficLivePause'),
                    recent: translations('trafficRecent'),
                    requests: translations('trafficRequests'),
                    resume: translations('trafficLiveResume'),
                    status: translations('trafficStatus'),
                    title: translations('trafficAnalytics'),
                    topPaths: translations('trafficTopPaths'),
                    download: translations('trafficExportDownload'),
                    exportCsv: translations('trafficExportCsv'),
                    exportFailed: translations('trafficExportFailed'),
                    exportNdjson: translations('trafficExportNdjson'),
                }}
            />
        </div>
    )
}

export default TrafficPage
