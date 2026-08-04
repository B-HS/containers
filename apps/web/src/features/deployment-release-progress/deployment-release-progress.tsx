'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import type { DeploymentRelease } from '@containers/contracts/deployment'
import { Badge } from '@shared/ui/badge'
import { cn } from '@shared/lib/utils'

const RELEASE_STAGES = ['creating', 'probing', 'observing', 'switching', 'healthy'] as const

const RELEASE_STATUS_LABEL_KEY = {
    creating: 'releaseStatusCreating',
    failed: 'releaseStatusFailed',
    healthy: 'releaseStatusHealthy',
    observing: 'releaseStatusObserving',
    probing: 'releaseStatusProbing',
    'rolled-back': 'releaseStatusRolledBack',
    'rolling-back': 'releaseStatusRollingBack',
    switching: 'releaseStatusSwitching',
} as const

const RELEASE_STATUS_VARIANT = {
    creating: 'attention',
    failed: 'danger',
    healthy: 'success',
    observing: 'attention',
    probing: 'attention',
    'rolled-back': 'danger',
    'rolling-back': 'attention',
    switching: 'attention',
} as const

type DeploymentReleaseProgressProps = {
    release: DeploymentRelease
}

export const DeploymentReleaseProgress: FC<DeploymentReleaseProgressProps> = ({ release }) => {
    const t = useTranslations('Dashboard')
    const activeIndex = RELEASE_STAGES.findIndex((stage) => stage === release.status)
    const failed = release.status === 'failed' || release.status === 'rolled-back'

    return (
        <div className="grid gap-3 bg-surface-2 p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-text-muted">{t('deploymentProgress')}</p>
                <Badge variant={RELEASE_STATUS_VARIANT[release.status]}>{t(RELEASE_STATUS_LABEL_KEY[release.status])}</Badge>
            </div>
            <ol className="grid gap-px sm:grid-cols-5">
                {RELEASE_STAGES.map((stage, index) => {
                    const reached = activeIndex >= 0 && index <= activeIndex
                    const current = index === activeIndex
                    return (
                        <li
                            key={stage}
                            aria-current={current ? 'step' : undefined}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 text-xs',
                                current ? 'bg-overlay-active font-medium text-text-strong' : 'bg-surface-1',
                                reached && !current ? 'text-text-muted' : undefined,
                                !reached ? 'text-text-subtle' : undefined,
                            )}
                        >
                            <span
                                className={cn(
                                    'size-1.5 shrink-0 rounded-full',
                                    failed && current ? 'bg-danger' : undefined,
                                    !failed && reached ? 'bg-text-strong' : undefined,
                                    !reached ? 'bg-overlay-strong' : undefined,
                                )}
                            />
                            <span className="truncate">{t(RELEASE_STATUS_LABEL_KEY[stage])}</span>
                        </li>
                    )
                })}
            </ol>
            <p className="truncate font-mono text-xs text-text-subtle">{release.id}</p>
        </div>
    )
}
