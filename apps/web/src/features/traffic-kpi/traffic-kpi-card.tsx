import type { FC } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@shared/ui/card'

type TrafficKpiCardProps = {
    hint?: string
    label: string
    value: string
}

export const TrafficKpiCard: FC<TrafficKpiCardProps> = ({ hint, label, value }) => (
    <Card className="gap-3 py-4" aria-label={label}>
        <CardHeader className="px-4">
            <CardDescription className="text-xs">{label}</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            {hint ? <p className="mt-1 text-xs text-text-subtle tabular-nums">{hint}</p> : null}
        </CardContent>
    </Card>
)
