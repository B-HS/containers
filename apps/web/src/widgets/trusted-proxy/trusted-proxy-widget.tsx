'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApproveTrustedProxy, useGetTrustedProxies, useRevokeTrustedProxy } from '@entities/trusted-proxy/trusted-proxy.query'
import { formatDateTime } from '@shared/lib/format-date-time'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Alert, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'

const SKELETON_ROW_COUNT = 3

type TrustedProxyWidgetProps = {
    canManage: boolean
}

export const TrustedProxyWidget: FC<TrustedProxyWidgetProps> = ({ canManage }) => {
    const [notes, setNotes] = useState<Record<string, string>>({})
    const translations = useTranslations('Dashboard')
    const state = useGetTrustedProxies()
    const approveProxy = useApproveTrustedProxy()
    const revokeProxy = useRevokeTrustedProxy()

    const approve = (address: string) => {
        approveProxy.mutate(
            { address, note: notes[address]?.trim() === '' ? null : (notes[address] ?? null) },
            {
                onError: (error) => toast.error(parseApiError(error, translations('trustedProxyApproveFailed'))),
                onSuccess: () => toast.success(translations('trustedProxyApproveSucceeded')),
            },
        )
    }

    const revoke = (address: string) => {
        revokeProxy.mutate(address, {
            onError: (error) => toast.error(parseApiError(error, translations('trustedProxyRevokeFailed'))),
            onSuccess: () => toast.success(translations('trustedProxyRevoked')),
        })
    }

    if (!canManage) {
        return (
            <WidgetSection id="trusted-proxy-title" title={translations('trustedProxy')} notice={translations('trustedProxyNotice')}>
                <Alert className="m-6 w-auto">
                    <AlertTitle>{translations('permissionRequired')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    if (state.isPending) {
        return (
            <WidgetSection id="trusted-proxy-title" title={translations('trustedProxy')} notice={translations('trustedProxyNotice')}>
                <div className="grid gap-4 p-6">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection
            id="trusted-proxy-title"
            title={translations('trustedProxy')}
            notice={translations('trustedProxyNotice')}
            badge={state.data?.approved.length ?? 0}
        >
            <div className="grid gap-px bg-background">
                <div className="bg-surface-1 p-6">
                    <h3 className="text-sm font-medium">{translations('trustedProxyCandidates')}</h3>
                    <p className="mt-1 text-xs text-text-subtle">{translations('trustedProxyCandidatesDescription')}</p>
                    {state.data?.candidates.length === 0 ? (
                        <Empty className="mt-4">
                            <EmptyHeader>
                                <EmptyTitle>{translations('trustedProxyCandidatesEmpty')}</EmptyTitle>
                                <EmptyDescription>{translations('trustedProxyCandidatesEmptyDescription')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table className="mt-4">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{translations('trustedProxyAddress')}</TableHead>
                                    <TableHead>{translations('trustedProxyHostname')}</TableHead>
                                    <TableHead>{translations('trustedProxyRequests')}</TableHead>
                                    <TableHead>{translations('trustedProxyHosts')}</TableHead>
                                    <TableHead>{translations('trustedProxyNote')}</TableHead>
                                    <TableHead className="text-right">{translations('trustedProxyApprove')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {state.data?.candidates.map((candidate) => (
                                    <TableRow key={candidate.address}>
                                        <TableCell className="font-mono text-xs">{candidate.address}</TableCell>
                                        <TableCell className="text-xs">{candidate.hostname ?? translations('trustedProxyHostnameUnknown')}</TableCell>
                                        <TableCell className="text-xs">{candidate.requestCount}</TableCell>
                                        <TableCell className="text-xs">{candidate.hosts.join(', ')}</TableCell>
                                        <TableCell>
                                            <Input
                                                aria-label={translations('trustedProxyNote')}
                                                value={notes[candidate.address] ?? ''}
                                                onChange={(event) => setNotes({ ...notes, [candidate.address]: event.target.value })}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" disabled={approveProxy.isPending} onClick={() => approve(candidate.address)}>
                                                {translations('trustedProxyApprove')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="bg-surface-1 p-6">
                    <h3 className="text-sm font-medium">{translations('trustedProxyApproved')}</h3>
                    <p className="mt-1 text-xs text-text-subtle">
                        {translations('trustedProxyEffective', { sources: state.data?.effectiveSources.join(', ') ?? '' })}
                    </p>
                    {state.data?.approved.length === 0 ? (
                        <Empty className="mt-4">
                            <EmptyHeader>
                                <EmptyTitle>{translations('trustedProxyApprovedEmpty')}</EmptyTitle>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table className="mt-4">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{translations('trustedProxyAddress')}</TableHead>
                                    <TableHead>{translations('trustedProxyHostname')}</TableHead>
                                    <TableHead>{translations('trustedProxyNote')}</TableHead>
                                    <TableHead>{translations('createdAt')}</TableHead>
                                    <TableHead className="text-right">{translations('remove')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {state.data?.approved.map((proxy) => (
                                    <TableRow key={proxy.address}>
                                        <TableCell className="font-mono text-xs">{proxy.address}</TableCell>
                                        <TableCell className="text-xs">{proxy.hostname ?? translations('trustedProxyHostnameUnknown')}</TableCell>
                                        <TableCell className="text-xs">{proxy.note ?? ''}</TableCell>
                                        <TableCell className="text-xs">{formatDateTime(proxy.approvedAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="ghost" disabled={revokeProxy.isPending} onClick={() => revoke(proxy.address)}>
                                                {translations('remove')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                        {state.data?.effectiveSources.map((source) => (
                            <Badge key={source} variant="secondary">
                                {source}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
        </WidgetSection>
    )
}
