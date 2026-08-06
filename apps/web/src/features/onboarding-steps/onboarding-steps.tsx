'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Link } from '../../i18n/navigation'

type OnboardingStep = {
    done: boolean
    href: string
    labelKey: 'onboardingArtifact' | 'onboardingContainer' | 'onboardingRoute' | 'onboardingStack'
}

type OnboardingStepsProps = {
    steps: OnboardingStep[]
}

export const OnboardingSteps: FC<OnboardingStepsProps> = ({ steps }) => {
    const t = useTranslations('Dashboard')
    const nextStep = steps.find((step) => !step.done)

    if (!nextStep) {
        return null
    }

    return (
        <section aria-labelledby="onboarding-title" className="grid gap-3 bg-surface-1 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-strong" id="onboarding-title">
                    {t('onboardingTitle')}
                </h2>
                <Badge variant="neutral">{`${steps.filter((step) => step.done).length} / ${steps.length}`}</Badge>
            </div>
            <p className="text-xs text-text-muted">{t('onboardingDescription')}</p>
            <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {steps.map((step) => (
                    <li className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2" key={step.href}>
                        <span className={step.done ? 'text-xs text-text-subtle line-through' : 'text-xs text-text-strong'}>{t(step.labelKey)}</span>
                        {step.done ? <Badge variant="success">{t('onboardingDone')}</Badge> : null}
                    </li>
                ))}
            </ol>
            <div>
                <Button asChild size="sm">
                    <Link href={nextStep.href}>{t(nextStep.labelKey)}</Link>
                </Button>
            </div>
        </section>
    )
}
