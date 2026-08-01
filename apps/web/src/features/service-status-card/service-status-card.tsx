import type { FC } from 'react'
import { Badge } from '@shared/ui/badge'
import { Card } from '@shared/ui/card'

type ServiceStatusCardProps = {
    label: string
    status: string
    value: string
}

export const ServiceStatusCard: FC<ServiceStatusCardProps> = ({ label, status, value }) => (
    <Card className="gap-0 p-3" aria-label={label}>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
            </div>
            <Badge variant="muted">{status}</Badge>
        </div>
    </Card>
)
