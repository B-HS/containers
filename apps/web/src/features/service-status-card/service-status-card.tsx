import type { FC } from 'react'
import { Badge } from '@shared/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@shared/ui/card'
import { Skeleton } from '@shared/ui/skeleton'

export type ServiceStatusState = 'healthy' | 'pending' | 'unreachable'

type ServiceStatusCardProps = {
    label: string
    state: ServiceStatusState
    stateLabel: string
    unit?: string
    value: string
}

const STATE_BADGE_VARIANT = {
    healthy: 'neutral',
    pending: 'neutral',
    unreachable: 'danger',
} as const

export const ServiceStatusCard: FC<ServiceStatusCardProps> = ({ label, state, stateLabel, unit, value }) => (
    <Card className="gap-3 py-4" aria-label={label}>
        <CardHeader className="px-4">
            <CardDescription className="text-xs">{label}</CardDescription>
            <CardAction>
                <Badge variant={STATE_BADGE_VARIANT[state]}>{stateLabel}</Badge>
            </CardAction>
        </CardHeader>
        <CardContent className="px-4">
            {state === 'pending' ? (
                <Skeleton className="h-8 w-28" />
            ) : (
                <p className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
                    {unit ? <span className="text-xs text-text-subtle">{unit}</span> : null}
                </p>
            )}
        </CardContent>
    </Card>
)
