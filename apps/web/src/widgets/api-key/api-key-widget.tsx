'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { API_KEY_SCOPE_VALUES, type ApiKeyScope } from '@containers/contracts/api-key'
import { useCreateApiKey, useGetApiKeys, useRevokeApiKey } from '@entities/api-key/api-key.query'
import { ApiKeyTokenNotice } from '@features/api-key-token-notice/api-key-token-notice'
import { ConfirmActionDialog } from '@features/confirm-action-dialog/confirm-action-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'

export const ApiKeyWidget: FC = () => {
    const [createdToken, setCreatedToken] = useState<string>()
    const [scopes, setScopes] = useState<Set<ApiKeyScope>>(() => new Set(API_KEY_SCOPE_VALUES))
    const t = useTranslations('Dashboard')
    const apiKeysQuery = useGetApiKeys()
    const apiKeys = apiKeysQuery.data ?? []
    const createApiKey = useCreateApiKey()
    const revokeApiKey = useRevokeApiKey()

    const toggleScope = (scope: ApiKeyScope, checked: boolean) => {
        setScopes((current) => {
            const next = new Set(current)
            if (checked) {
                next.add(scope)
            } else {
                next.delete(scope)
            }
            return next
        })
    }

    const create = (form: HTMLFormElement) => {
        const formData = new FormData(form)
        setCreatedToken(undefined)
        createApiKey.mutate(
            {
                expiresInDays: Number(formData.get('expiresInDays')),
                name: String(formData.get('name')),
                scopes: API_KEY_SCOPE_VALUES.filter((scope) => scopes.has(scope)),
            },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('apiKeyFailed')),
                onSuccess: (record) => {
                    setCreatedToken(record.token)
                    form.reset()
                    toast.success(t('apiKeyCreated'))
                },
            },
        )
    }

    const revoke = (id: string) => {
        revokeApiKey.mutate(id, {
            onError: (error) => toast.error(error instanceof Error ? error.message : t('apiKeyFailed')),
            onSuccess: () => toast.success(t('apiKeyRevoked')),
        })
    }

    return (
        <WidgetSection id="api-key-control-title" title={t('apiKeyControl')} badge={apiKeys.length}>
            {createdToken ? <ApiKeyTokenNotice token={createdToken} /> : null}
            <form
                className="grid gap-6 bg-surface-1 p-6"
                onSubmit={(event) => {
                    event.preventDefault()
                    create(event.currentTarget)
                }}
            >
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="grid gap-2">
                        <Label htmlFor="api-key-name">{t('apiKeyName')}</Label>
                        <Input id="api-key-name" name="name" required maxLength={80} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="api-key-expiry">{t('expiresInDays')}</Label>
                        <Input id="api-key-expiry" name="expiresInDays" type="number" defaultValue={30} min={1} max={365} required />
                    </div>
                </div>
                <fieldset className="grid gap-3">
                    <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('scopes')}</legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                        {API_KEY_SCOPE_VALUES.map((scope) => (
                            <div key={scope} className="flex items-center gap-2">
                                <Checkbox
                                    id={`api-key-scope-${scope}`}
                                    checked={scopes.has(scope)}
                                    onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                                />
                                <Label htmlFor={`api-key-scope-${scope}`} className="font-mono text-xs">
                                    {scope}
                                </Label>
                            </div>
                        ))}
                    </div>
                </fieldset>
                <Button className="justify-self-start" type="submit" disabled={createApiKey.isPending}>
                    {t('createApiKey')}
                </Button>
            </form>
            {apiKeysQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
            ) : null}
            {!apiKeysQuery.isPending && apiKeys.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('apiKeyEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('apiKeyEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            <div className="grid gap-px bg-background">
                {apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 bg-surface-1 px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-strong">{apiKey.name}</p>
                            <p className="mt-1 font-mono text-xs text-text-muted">{apiKey.prefix}</p>
                            <p className="mt-1 font-mono text-xs text-text-subtle">{apiKey.scopes.join(' · ')}</p>
                        </div>
                        {apiKey.revokedAt ? (
                            <Badge variant="danger">revoked</Badge>
                        ) : (
                            <ConfirmActionDialog
                                confirmLabel={t('revoke')}
                                description={t('apiKeyRevokeDescription')}
                                impact={apiKey.scopes.join(' · ')}
                                onConfirm={() => revoke(apiKey.id)}
                                pending={revokeApiKey.isPending}
                                target={`${apiKey.name} · ${apiKey.prefix}`}
                                title={t('apiKeyRevokeTitle')}
                                trigger={
                                    <Button type="button" variant="ghost" size="sm" disabled={revokeApiKey.isPending}>
                                        {t('revoke')}
                                    </Button>
                                }
                            />
                        )}
                    </div>
                ))}
            </div>
        </WidgetSection>
    )
}
