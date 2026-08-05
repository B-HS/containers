'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import type { DeploymentFailureDiagnostics } from '@containers/contracts/deployment'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'

const FAILURE_LOG_ACCORDION_VALUE = 'deployment-failure-log'

const STAGE_LABEL_KEY = {
    observation: 'deploymentFailureStageObservation',
    probe: 'deploymentFailureStageProbe',
    route: 'deploymentFailureStageRoute',
} as const

type DeploymentFailureDetailProps = {
    diagnostics: DeploymentFailureDiagnostics | undefined
    failureCode: string | null
}

export const DeploymentFailureDetail: FC<DeploymentFailureDetailProps> = ({ diagnostics, failureCode }) => {
    const t = useTranslations('Dashboard')

    return (
        <div aria-live="polite" className="grid gap-px">
            <Alert variant="destructive">
                <AlertTitle>{t('deploymentFailureTitle')}</AlertTitle>
                <AlertDescription>
                    <span className="font-mono break-all">{failureCode ?? t('deploymentFailureUnknown')}</span>
                </AlertDescription>
            </Alert>
            {diagnostics ? (
                <dl className="grid gap-2 bg-surface-2 p-4 text-xs sm:grid-cols-3">
                    <div className="grid gap-1">
                        <dt className="text-text-subtle">{t('deploymentFailureStage')}</dt>
                        <dd className="text-text-strong">{t(STAGE_LABEL_KEY[diagnostics.stage])}</dd>
                    </div>
                    <div className="grid gap-1">
                        <dt className="text-text-subtle">{t('deploymentFailureExitCode')}</dt>
                        <dd className="font-mono text-text-strong">{diagnostics.exitCode ?? t('deploymentFailureUnknown')}</dd>
                    </div>
                    <div className="grid min-w-0 gap-1">
                        <dt className="text-text-subtle">{t('deploymentFailureStateError')}</dt>
                        <dd className="break-all text-text-strong">{diagnostics.stateError ?? t('deploymentFailureNone')}</dd>
                    </div>
                </dl>
            ) : null}
            {diagnostics ? (
                <Accordion className="grid gap-px bg-background" type="multiple">
                    <AccordionItem className="bg-surface-1 px-3" value={FAILURE_LOG_ACCORDION_VALUE}>
                        <AccordionTrigger>{t('deploymentFailureLog', { count: diagnostics.logLines.length })}</AccordionTrigger>
                        <AccordionContent>
                            <div className="grid gap-2">
                                <p className="text-xs text-text-subtle">{t('deploymentFailureLogNotice')}</p>
                                {diagnostics.logLines.length > 0 ? (
                                    <pre className="max-h-64 overflow-auto bg-surface-3 p-3 text-xs whitespace-pre-wrap">
                                        {diagnostics.logLines.join('\n')}
                                    </pre>
                                ) : (
                                    <p className="text-xs text-text-muted">{t('deploymentFailureLogEmpty')}</p>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            ) : null}
        </div>
    )
}
