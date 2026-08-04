'use client'

import type { FC } from 'react'
import { CopyIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'

type ApiKeyTokenNoticeProps = {
    token: string
}

export const ApiKeyTokenNotice: FC<ApiKeyTokenNoticeProps> = ({ token }) => {
    const t = useTranslations('Dashboard')

    const copy = async () => {
        await navigator.clipboard.writeText(token)
        toast.success(t('copied'))
    }

    return (
        <Alert variant="warning" className="m-4 w-auto">
            <TriangleAlertIcon />
            <AlertTitle>{t('createdToken')}</AlertTitle>
            <AlertDescription>
                <p>{t('tokenWarning')}</p>
                <div className="mt-2 flex w-full min-w-0 items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto bg-surface-3 px-3 py-2 font-mono text-xs text-text-strong">{token}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
                        <CopyIcon />
                        {t('copy')}
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    )
}
