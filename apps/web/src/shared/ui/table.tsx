import type { ComponentProps, FC } from 'react'

import { cn } from '@shared/lib/utils'

const Table: FC<ComponentProps<'table'>> = ({ className, ...props }) => (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
)

const TableHeader: FC<ComponentProps<'thead'>> = ({ className, ...props }) => (
    <thead data-slot="table-header" className={cn('bg-surface-2 text-text-muted', className)} {...props} />
)

const TableBody: FC<ComponentProps<'tbody'>> = ({ className, ...props }) => <tbody data-slot="table-body" className={cn(className)} {...props} />

const TableFooter: FC<ComponentProps<'tfoot'>> = ({ className, ...props }) => (
    <tfoot data-slot="table-footer" className={cn('bg-surface-2 font-medium', className)} {...props} />
)

const TableRow: FC<ComponentProps<'tr'>> = ({ className, ...props }) => (
    <tr
        data-slot="table-row"
        className={cn(
            'transition-colors hover:bg-overlay-hover has-aria-expanded:bg-overlay-hover data-[state=selected]:bg-overlay-active',
            className,
        )}
        {...props}
    />
)

const TableHead: FC<ComponentProps<'th'>> = ({ className, ...props }) => (
    <th
        data-slot="table-head"
        scope="col"
        className={cn(
            'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
            className,
        )}
        {...props}
    />
)

const TableCell: FC<ComponentProps<'td'>> = ({ className, ...props }) => (
    <td
        data-slot="table-cell"
        className={cn(
            'px-3 py-2 align-middle tabular-nums whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
            className,
        )}
        {...props}
    />
)

const TableCaption: FC<ComponentProps<'caption'>> = ({ className, ...props }) => (
    <caption data-slot="table-caption" className={cn('mt-4 text-sm text-text-muted', className)} {...props} />
)

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
