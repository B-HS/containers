'use client'

import type { FC, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip'

type NginxHelpTooltipProps = {
    children: ReactNode
    messageKey: string
}

export const NginxHelpTooltip: FC<NginxHelpTooltipProps> = ({ children, messageKey }) => {
    const t = useTranslations('Dashboard')
    const description = t.has(messageKey) ? t(messageKey) : undefined

    if (description === undefined) {
        return <>{children}</>
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
