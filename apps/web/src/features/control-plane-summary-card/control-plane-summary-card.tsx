'use client'

import type { FC, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'

type ControlPlaneSummaryCardProps = {
    detail?: string
    label: string
    value: ReactNode
}

export const ControlPlaneSummaryCard: FC<ControlPlaneSummaryCardProps> = ({ detail, label, value }) => (
    <Card className="gap-3 py-5">
        <CardHeader className="px-5">
            <CardTitle className="text-xs font-medium text-text-subtle">{label}</CardTitle>
            {detail ? <CardDescription className="text-xs">{detail}</CardDescription> : null}
        </CardHeader>
        <CardContent className="px-5 text-lg font-semibold tabular-nums text-text-strong">{value}</CardContent>
    </Card>
)
