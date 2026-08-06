'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useGetContainerList, useGetEngineOverview } from '@entities/engine/engine.query'
import { useGetApiHealth } from '@entities/health/health.query'
import { useGetNginxStatus } from '@entities/nginx/nginx.query'
import { useGetTrafficSummary } from '@entities/traffic/traffic.query'
import { useGetArtifacts } from '@entities/artifact/artifact.query'
import { useGetDeploymentStacks } from '@entities/deployment/deployment-stack.query'
import { useGetNginxRoutes } from '@entities/nginx/nginx.query'
import { OnboardingSteps } from '@features/onboarding-steps/onboarding-steps'
import { ServiceStatusCard, type ServiceStatusState } from '@features/service-status-card/service-status-card'

const BYTE_GIB = 1_073_741_824
const GIB_FRACTION_DIGITS = 1
const RATE_FRACTION_DIGITS = 2
const PLACEHOLDER = '—'

const resolveState = ({ isError, isPending }: { isError: boolean; isPending: boolean }) => {
    if (isError) return 'unreachable'
    if (isPending) return 'pending'
    return 'healthy'
}

const formatGib = (bytes: number) => (bytes / BYTE_GIB).toFixed(GIB_FRACTION_DIGITS)

export const OverviewWidget: FC = () => {
    const translations = useTranslations('Dashboard')
    const healthQuery = useGetApiHealth()
    const engineQuery = useGetEngineOverview()
    const containerQuery = useGetContainerList()
    const nginxQuery = useGetNginxStatus()
    const trafficQuery = useGetTrafficSummary()
    const artifactQuery = useGetArtifacts()
    const routeQuery = useGetNginxRoutes()
    const stackQuery = useGetDeploymentStacks()

    const stateLabel = (state: ServiceStatusState) => (state === 'unreachable' ? translations('unreachable') : translations('healthy'))
    const engineState = resolveState(engineQuery)
    const containerState = resolveState(containerQuery)
    const nginxState = resolveState(nginxQuery)
    const trafficState = resolveState(trafficQuery)
    const healthState = resolveState(healthQuery)

    const onboardingSteps = [
        { done: (artifactQuery.data ?? []).length > 0, href: '/artifacts', labelKey: 'onboardingArtifact' as const },
        { done: (containerQuery.data ?? []).length > 0, href: '/containers/new', labelKey: 'onboardingContainer' as const },
        { done: (routeQuery.data ?? []).length > 0, href: '/nginx/routes', labelKey: 'onboardingRoute' as const },
        { done: (stackQuery.data ?? []).length > 0, href: '/deployments/stacks', labelKey: 'onboardingStack' as const },
    ]

    return (
        <div className="grid gap-px">
            <OnboardingSteps steps={onboardingSteps} />
            <section className="grid grid-cols-1 gap-px md:grid-cols-2 xl:grid-cols-3" aria-label={translations('heading')}>
                <ServiceStatusCard
                    label={translations('api')}
                    state={healthState}
                    stateLabel={stateLabel(healthState)}
                    value={healthQuery.data?.status.toUpperCase() ?? PLACEHOLDER}
                />
                <ServiceStatusCard
                    label={translations('engine')}
                    state={engineState}
                    stateLabel={stateLabel(engineState)}
                    value={engineQuery.data ? `v${engineQuery.data.version}` : PLACEHOLDER}
                />
                <ServiceStatusCard
                    label={translations('nginx')}
                    state={nginxState}
                    stateLabel={stateLabel(nginxState)}
                    unit={translations('nginxConnections')}
                    value={nginxQuery.data?.activeConnections.toString() ?? PLACEHOLDER}
                />
                <ServiceStatusCard
                    label={translations('containers')}
                    state={containerState}
                    stateLabel={stateLabel(containerState)}
                    value={containerQuery.data?.length.toString() ?? PLACEHOLDER}
                />
                <ServiceStatusCard
                    label={translations('traffic')}
                    state={trafficState}
                    stateLabel={stateLabel(trafficState)}
                    unit={translations('trafficPerSecond')}
                    value={trafficQuery.data ? trafficQuery.data.requestsPerSecond.toFixed(RATE_FRACTION_DIGITS) : PLACEHOLDER}
                />
                <ServiceStatusCard
                    label={translations('disk')}
                    state={engineState}
                    stateLabel={stateLabel(engineState)}
                    unit={translations('diskUnit')}
                    value={
                        engineQuery.data
                            ? `${formatGib(engineQuery.data.disk.usedBytes)} / ${formatGib(engineQuery.data.disk.capacityBytes)}`
                            : PLACEHOLDER
                    }
                />
            </section>
        </div>
    )
}
