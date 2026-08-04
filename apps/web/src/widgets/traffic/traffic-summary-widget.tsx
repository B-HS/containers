'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useGetTrafficAnalytics } from '@entities/traffic/traffic.query'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { TrafficKpiGrid } from '@features/traffic-kpi/traffic-kpi-grid'
import { TrafficKpiSkeleton } from '@features/traffic-kpi/traffic-kpi-skeleton'
import { WidgetSection } from '@shared/common/widget-section'
import { Link } from '../../i18n/navigation'

export const TrafficSummaryWidget: FC = () => {
    const translations = useTranslations('Dashboard')
    const { data: analytics, isPending } = useGetTrafficAnalytics()

    return (
        <WidgetSection
            id="traffic-summary-title"
            title={translations('trafficSummary')}
            header={
                <div className="flex items-center gap-2">
                    <Badge variant="neutral">60m</Badge>
                    <Button asChild size="xs" variant="outline">
                        <Link href="/traffic">{translations('trafficViewDetails')}</Link>
                    </Button>
                </div>
            }
        >
            {isPending ? <TrafficKpiSkeleton /> : null}
            {!isPending && (!analytics || analytics.requestCount === 0) ? (
                <Empty className="py-12">
                    <EmptyHeader>
                        <EmptyTitle className="text-base">{translations('trafficEmpty')}</EmptyTitle>
                        <EmptyDescription>{translations('trafficEmptyHint')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {analytics && analytics.requestCount > 0 ? (
                <TrafficKpiGrid
                    analytics={analytics}
                    labels={{
                        bytes: translations('trafficBytes'),
                        errorRate: translations('trafficErrorRate'),
                        latency: translations('trafficLatency'),
                        requests: translations('trafficRequests'),
                    }}
                />
            ) : null}
        </WidgetSection>
    )
}
