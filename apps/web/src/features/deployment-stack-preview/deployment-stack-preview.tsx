'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import type { ComposeStackPreview } from '@containers/contracts/deployment-stack'
import { Badge } from '@shared/ui/badge'

type DeploymentStackPreviewProps = {
    preview: ComposeStackPreview
}

export const DeploymentStackPreview: FC<DeploymentStackPreviewProps> = ({ preview }) => {
    const t = useTranslations('Dashboard')

    return (
        <section aria-labelledby="deployment-stack-preview-title" className="grid gap-4 bg-surface-1 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-strong" id="deployment-stack-preview-title">
                    {t('deploymentStackPreviewTitle')}
                </h3>
                <Badge variant="neutral">{preview.order.join(' → ')}</Badge>
            </div>
            <ul className="grid gap-2">
                {preview.services.map((plan) => (
                    <li className="grid gap-1 bg-surface-2 p-3" key={plan.service}>
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-text-strong">{plan.manifest.name}</span>
                            <Badge variant={plan.manifest.route === null ? 'neutral' : 'success'}>
                                {plan.manifest.route === null ? t('deploymentInternalService') : plan.manifest.route.hostname}
                            </Badge>
                        </div>
                        <p className="truncate font-mono text-xs text-text-subtle">{plan.manifest.imageDigest}</p>
                        <p className="text-xs text-text-muted">
                            :{plan.manifest.internalPort}
                            {plan.dependsOn.length > 0 ? ` · ${t('deploymentStackDependsOn')}: ${plan.dependsOn.join(', ')}` : ''}
                        </p>
                    </li>
                ))}
            </ul>
            {preview.ignored.length > 0 ? (
                <div className="grid gap-2">
                    <h4 className="text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentStackIgnored')}</h4>
                    <ul className="grid gap-1">
                        {preview.ignored.map((entry) => (
                            <li className="text-xs text-text-muted" key={`${entry.service}-${entry.key}`}>
                                <span className="font-mono text-text-subtle">
                                    {entry.service}.{entry.key}
                                </span>{' '}
                                — {entry.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    )
}
