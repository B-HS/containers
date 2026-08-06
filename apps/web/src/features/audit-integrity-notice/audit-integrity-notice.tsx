import type { FC } from 'react'
import type { AuditIntegrity } from '@containers/contracts/audit'
import { cn } from '@shared/lib/utils'

type AuditIntegrityNoticeProps = {
    brokenLabel: string
    brokenEntryLabel: string
    integrity: AuditIntegrity
    intactLabel: string
    unchainedLabel: string
}

export const AuditIntegrityNotice: FC<AuditIntegrityNoticeProps> = ({ brokenLabel, brokenEntryLabel, integrity, intactLabel, unchainedLabel }) => (
    <div
        aria-live="polite"
        className={cn('grid gap-1 p-4 text-sm', integrity.brokenAt === null ? 'bg-surface-3 text-text-muted' : 'bg-danger-surface text-danger')}
    >
        <p className="font-medium">{integrity.brokenAt === null ? intactLabel : brokenLabel}</p>
        {integrity.brokenEntry !== null && (
            <p className="break-all">
                {brokenEntryLabel} {integrity.brokenEntry.operation} · {integrity.brokenEntry.result} · {integrity.brokenEntry.createdAt}
            </p>
        )}
        {integrity.unchained > 0 && <p>{unchainedLabel}</p>}
    </div>
)
