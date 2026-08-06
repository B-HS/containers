import type { FC } from 'react'
import { Button } from '@shared/ui/button'
import { Link } from '../../i18n/navigation'

type ScreenRoleNoticeProps = {
    counterpartHref: string
    counterpartLabel: string
    description: string
}

export const ScreenRoleNotice: FC<ScreenRoleNoticeProps> = ({ counterpartHref, counterpartLabel, description }) => (
    <section className="flex flex-wrap items-center justify-between gap-3 bg-surface-1 px-6 py-4">
        <p className="min-w-0 text-xs text-text-muted">{description}</p>
        <Button asChild size="xs" variant="outline">
            <Link href={counterpartHref}>{counterpartLabel}</Link>
        </Button>
    </section>
)
