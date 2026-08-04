'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NginxDirective } from '@containers/nginx-config/parse'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { NginxDirectiveRow } from '@features/nginx-directive-row/nginx-directive-row'

type NginxDirectiveSectionProps = {
    addLabel: string
    directives: NginxDirective[]
    namePlaceholder: string
    onUpsert: (node: NginxDirective | undefined, name: string, value: string) => void
    removeLabel: string
    title?: string
    valuePlaceholder: string
}

export const NginxDirectiveSection: FC<NginxDirectiveSectionProps> = ({
    addLabel,
    directives,
    namePlaceholder,
    onUpsert,
    removeLabel,
    title,
    valuePlaceholder,
}) => {
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')

    const addDirective = () => {
        if (newName.trim() === '') {
            return
        }
        onUpsert(undefined, newName.trim(), newValue)
        setNewName('')
        setNewValue('')
    }

    return (
        <div className="grid gap-3">
            {title ? <h4 className="text-sm font-semibold text-text-strong">{title}</h4> : null}
            {directives.length > 0 ? (
                <div className="grid gap-2">
                    {directives.map((node, index) => (
                        <NginxDirectiveRow
                            key={`${node.raw}-${index}`}
                            node={node}
                            onValueChange={(target, value) => onUpsert(target, target.name, value)}
                            onRemove={(target) => onUpsert(target, '', '')}
                            removeLabel={removeLabel}
                        />
                    ))}
                </div>
            ) : null}
            <div className="flex items-center gap-2 bg-overlay-subtle p-3">
                <Input
                    className="h-8 w-40 font-mono text-xs"
                    placeholder={namePlaceholder}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    spellCheck={false}
                />
                <Input
                    className="h-8 font-mono text-xs"
                    placeholder={valuePlaceholder}
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    spellCheck={false}
                />
                <Button type="button" variant="outline" size="xs" onClick={addDirective}>
                    {addLabel}
                </Button>
            </div>
        </div>
    )
}
