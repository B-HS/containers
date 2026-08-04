'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useCreateDeploymentSecret, useGetDeploymentSecrets, useRemoveDeploymentSecret } from '@entities/deployment/deployment-secret.query'
import { ConfirmActionDialog } from '@features/confirm-action-dialog/confirm-action-dialog'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'

type DeploymentSecretWidgetProps = {
    labels?: Record<string, string>
    secrets?: unknown[]
}

/**
 * Text comes from the Dashboard message namespace and data from the deployment secret query,
 * so the legacy props are accepted for compatibility with the route file and are not read.
 */
export const DeploymentSecretWidget: FC<DeploymentSecretWidgetProps> = () => {
    const t = useTranslations('Dashboard')
    const secretsQuery = useGetDeploymentSecrets()
    const secrets = secretsQuery.data ?? []
    const createSecret = useCreateDeploymentSecret()
    const removeSecret = useRemoveDeploymentSecret()

    const save = (form: HTMLFormElement) => {
        const formData = new FormData(form)
        createSecret.mutate(
            { reference: String(formData.get('reference')), value: String(formData.get('value')) },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentSecretFailed')),
                onSuccess: () => {
                    form.reset()
                    toast.success(t('deploymentSecretSaved'))
                },
            },
        )
    }

    const remove = (id: string, confirmation: string) => {
        removeSecret.mutate(
            { id, confirmation },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('deploymentSecretFailed')),
                onSuccess: () => toast.success(t('deploymentSecretRemoved')),
            },
        )
    }

    return (
        <WidgetSection
            id="deployment-secret-title"
            title={t('deploymentSecretControl')}
            notice={t('deploymentSecretValueNotice')}
            badge={secrets.length}
        >
            <form
                className="grid gap-4 bg-surface-1 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                onSubmit={(event) => {
                    event.preventDefault()
                    save(event.currentTarget)
                }}
            >
                <div className="grid gap-2">
                    <Label htmlFor="deployment-secret-reference">{t('deploymentSecretReference')}</Label>
                    <Input id="deployment-secret-reference" name="reference" placeholder="apps/my-service/token" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-secret-value">{t('deploymentSecretValue')}</Label>
                    <Input id="deployment-secret-value" name="value" type="password" autoComplete="new-password" required />
                </div>
                <Button type="submit" disabled={createSecret.isPending}>
                    {t('deploymentSecretSave')}
                </Button>
            </form>
            {secretsQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            ) : null}
            {!secretsQuery.isPending && secrets.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('deploymentSecretEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('deploymentSecretEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            <div className="grid gap-px bg-background xl:grid-cols-2">
                {secrets.map((secret) => (
                    <div key={secret.id} className="flex min-w-0 items-center justify-between gap-3 bg-surface-1 px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate font-mono text-sm text-text-strong">{secret.reference}</p>
                            <p className="mt-1 text-xs text-text-subtle">
                                {t('deploymentVersion')} {secret.version}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <ConfirmActionDialog
                                confirmLabel={t('remove')}
                                confirmationHint={t('deploymentSecretConfirmation')}
                                confirmationValue={secret.reference}
                                description={t('deploymentSecretRemoveDescription')}
                                onConfirm={() => remove(secret.id, secret.reference)}
                                pending={removeSecret.isPending}
                                target={secret.reference}
                                title={t('deploymentSecretRemoveTitle')}
                                trigger={
                                    <Button type="button" variant="ghost" size="sm" disabled={removeSecret.isPending}>
                                        {t('remove')}
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                ))}
            </div>
        </WidgetSection>
    )
}
