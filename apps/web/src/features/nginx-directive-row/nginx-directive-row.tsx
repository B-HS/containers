'use client'

import type { FC } from 'react'
import type { NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'

type NginxDirectiveRowProps = {
    node: NginxDirective
    onRemove: (node: NginxDirective) => void
    onValueChange: (node: NginxDirective, value: string) => void
    removeLabel: string
}

export const NginxDirectiveRow: FC<NginxDirectiveRowProps> = ({ node, onRemove, onValueChange, removeLabel }) => (
    <div className="flex items-center gap-2">
        <code className="shrink-0 font-mono text-sm text-text-strong">{node.name}</code>
        <Input
            className="h-8 font-mono text-xs"
            value={node.args.join(' ')}
            onChange={(event) => onValueChange(node, event.target.value)}
            spellCheck={false}
        />
        <Button type="button" variant="ghost" size="xs" onClick={() => onRemove(node)}>
            {removeLabel}
        </Button>
    </div>
)
