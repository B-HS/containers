import { Skeleton } from '@shared/ui/skeleton'

const PanelLoading = () => (
    <div className="grid gap-px">
        <div className="bg-surface-2 px-6 py-7">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>
        <section className="bg-surface-1">
            <div className="bg-surface-2 px-4 py-3">
                <Skeleton className="h-4 w-40" />
            </div>
            <div className="grid gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
            </div>
        </section>
    </div>
)

export default PanelLoading
