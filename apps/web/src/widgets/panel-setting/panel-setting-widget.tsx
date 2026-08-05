'use client'

import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MAX_EXTRA_TRUSTED_ORIGINS } from '@containers/contracts/panel-setting'
import { useGetPanelSetting, useUpdatePanelSetting } from '@entities/panel-setting/panel-setting.query'
import { formatDateTime } from '@shared/lib/format-date-time'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Alert, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Textarea } from '@shared/ui/textarea'
import { WidgetSection } from '@shared/common/widget-section'

const SKELETON_FIELD_COUNT = 3
const ORIGIN_SEPARATOR = '\n'

type PanelSettingWidgetProps = {
    canManage: boolean
}

const parseOriginLines = (value: string) =>
    value
        .split(ORIGIN_SEPARATOR)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

export const PanelSettingWidget: FC<PanelSettingWidgetProps> = ({ canManage }) => {
    const [publicOrigin, setPublicOrigin] = useState('')
    const [extraOrigins, setExtraOrigins] = useState('')
    const translations = useTranslations('Dashboard')
    const setting = useGetPanelSetting()
    const updateSetting = useUpdatePanelSetting()

    const extraOriginList = parseOriginLines(extraOrigins)
    const tooManyOrigins = extraOriginList.length > MAX_EXTRA_TRUSTED_ORIGINS

    const submit = () => {
        updateSetting.mutate(
            { extraTrustedOrigins: extraOriginList, publicOrigin: publicOrigin.trim() === '' ? null : publicOrigin.trim() },
            {
                onError: (error) => toast.error(parseApiError(error, translations('panelSettingSaveFailed'))),
                onSuccess: () => toast.success(translations('panelSettingSaved')),
            },
        )
    }

    useEffect(() => {
        if (!setting.data) return
        setPublicOrigin(setting.data.publicOrigin ?? '')
        setExtraOrigins(setting.data.extraTrustedOrigins.join(ORIGIN_SEPARATOR))
    }, [setting.data])

    if (!canManage) {
        return (
            <WidgetSection id="panel-setting-title" title={translations('panelSetting')} notice={translations('panelSettingNotice')}>
                <Alert className="m-6 w-auto">
                    <AlertTitle>{translations('permissionRequired')}</AlertTitle>
                </Alert>
            </WidgetSection>
        )
    }

    if (setting.isPending) {
        return (
            <WidgetSection id="panel-setting-title" title={translations('panelSetting')} notice={translations('panelSettingNotice')}>
                <div className="grid gap-4 p-6">
                    {Array.from({ length: SKELETON_FIELD_COUNT }, (_, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection id="panel-setting-title" title={translations('panelSetting')} notice={translations('panelSettingNotice')}>
            <div className="grid gap-5 p-6">
                {setting.data?.restartRequired === true && (
                    <Alert>
                        <AlertTitle>{translations('panelSettingRestartRequired')}</AlertTitle>
                    </Alert>
                )}
                {(setting.data?.hostnameCandidates.length ?? 0) > 0 && (
                    <div className="grid gap-2">
                        <Label>{translations('panelSettingHostnameCandidates')}</Label>
                        <p className="text-xs text-text-subtle">{translations('panelSettingHostnameCandidatesDescription')}</p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{translations('panelSettingHostname')}</TableHead>
                                    <TableHead>{translations('panelSettingRejected')}</TableHead>
                                    <TableHead>{translations('trustedProxyRequests')}</TableHead>
                                    <TableHead className="text-right">{translations('panelSettingUseHostname')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {setting.data?.hostnameCandidates.map((candidate) => (
                                    <TableRow key={candidate.hostname}>
                                        <TableCell className="font-mono text-xs">{candidate.hostname}</TableCell>
                                        <TableCell className="text-xs">{candidate.rejectedCount}</TableCell>
                                        <TableCell className="text-xs">{candidate.requestCount}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="ghost" onClick={() => setPublicOrigin(`https://${candidate.hostname}`)}>
                                                {translations('panelSettingUseHostname')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <div className="grid gap-2">
                    <Label htmlFor="panel-public-origin">{translations('panelSettingPublicOrigin')}</Label>
                    <Input
                        id="panel-public-origin"
                        placeholder="https://panel.example.com"
                        value={publicOrigin}
                        onChange={(event) => setPublicOrigin(event.target.value)}
                    />
                    <p className="text-xs text-text-subtle">{translations('panelSettingPublicOriginDescription')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="panel-extra-origins">{translations('panelSettingExtraOrigins')}</Label>
                    <Textarea
                        id="panel-extra-origins"
                        rows={4}
                        placeholder={'https://ops.example.com'}
                        value={extraOrigins}
                        aria-invalid={tooManyOrigins}
                        onChange={(event) => setExtraOrigins(event.target.value)}
                    />
                    <p className="text-xs text-text-subtle">
                        {translations('panelSettingExtraOriginsDescription', { max: MAX_EXTRA_TRUSTED_ORIGINS })}
                    </p>
                </div>
                <div className="grid gap-2">
                    <Label>{translations('panelSettingEffectiveOrigins')}</Label>
                    <div className="flex flex-wrap gap-2">
                        {setting.data?.effectiveTrustedOrigins.map((origin) => (
                            <Badge key={origin} variant="secondary">
                                {origin}
                            </Badge>
                        ))}
                    </div>
                    <p className="text-xs text-text-subtle">
                        {translations('panelSettingBootOrigin', { origin: setting.data?.bootOrigin ?? '' })}
                        {setting.data?.updatedAt === null ? '' : ` · ${formatDateTime(setting.data?.updatedAt ?? null)}`}
                    </p>
                </div>
                <div>
                    <Button type="button" disabled={updateSetting.isPending || tooManyOrigins} onClick={submit}>
                        {translations('save')}
                    </Button>
                </div>
            </div>
        </WidgetSection>
    )
}
