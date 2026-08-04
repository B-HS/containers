import type { FC } from 'react'
import { Skeleton } from '@shared/ui/skeleton'

const SKELETON_CARDS = [0, 1, 2, 3]

export const TrafficKpiSkeleton: FC = () => (
    <div className="grid gap-px bg-background sm:grid-cols-2 xl:grid-cols-4">
        {SKELETON_CARDS.map((card) => (
            <div key={card} className="bg-surface-1 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-24" />
            </div>
        ))}
    </div>
)
