'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import type { DirectiveEntry } from '@shared/lib/nginx-config/nginx-directives'
import type { NginxConfigNode, NginxDirective } from '@containers/nginx-config/parse'
import { findDirectiveNodes, removeDirectiveNodes, upsertDirectiveNode } from '@shared/lib/nginx-config/nginx-editor-model'
import { tokenizeNginxArgs } from '@containers/nginx-config/parse'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { NginxHelpTooltip } from '@features/nginx-help-tooltip/nginx-help-tooltip'

type NginxDirectiveEditorProps = {
    entry: DirectiveEntry
    children: NginxConfigNode[]
    indent: string
    onChange: (children: NginxConfigNode[]) => void
}

export const NginxDirectiveEditor: FC<NginxDirectiveEditorProps> = ({ entry, children, indent, onChange }) => {
    const t = useTranslations('Dashboard')
    const existing = findDirectiveNodes(children, entry.name)
    const placeholder = entry.placeholderKey ? t(`nginxGui.placeholder.${entry.placeholderKey}`) : undefined
    const helpKey = `nginxGui.directive.${entry.name}`

    if (entry.multiple) {
        const setNodeArgs = (node: NginxDirective, value: string) => {
            const nextArgs = value.trim() === '' ? [] : tokenizeNginxArgs(value)
            onChange(
                children.map((child) => (child === node ? { ...node, args: nextArgs, raw: `${indent}${entry.name} ${nextArgs.join(' ')};` } : child)),
            )
        }
        const removeNode = (node: NginxDirective) => {
            onChange(children.filter((child) => child !== node))
        }
        const addNode = () => {
            onChange([...children, { kind: 'directive', name: entry.name, args: [], raw: `${indent}${entry.name};` }])
        }

        return (
            <div className="grid gap-2">
                <div className="flex items-center gap-2">
                    <NginxHelpTooltip messageKey={helpKey}>
                        <code className="font-mono text-sm text-text-strong">{entry.name}</code>
                    </NginxHelpTooltip>
                    <Button className="ml-auto" type="button" variant="outline" size="xs" onClick={addNode}>
                        {t('nginxGui.add')}
                    </Button>
                </div>
                {existing.length === 0 ? <p className="pl-4 text-xs text-text-subtle">{t('nginxGui.noValues')}</p> : null}
                {existing.map((node, index) => (
                    <div key={`${node.raw}-${index}`} className="flex items-center gap-2 pl-4">
                        <Input
                            className="h-8 font-mono text-xs"
                            placeholder={placeholder}
                            value={node.args.join(' ')}
                            onChange={(event) => setNodeArgs(node, event.target.value)}
                            spellCheck={false}
                        />
                        <Button type="button" variant="ghost" size="xs" onClick={() => removeNode(node)}>
                            {t('nginxGui.remove')}
                        </Button>
                    </div>
                ))}
            </div>
        )
    }

    const checked = existing.length > 0
    const node = existing[0]
    const value = node?.args.join(' ') ?? ''

    const toggle = (next: boolean) => {
        if (next) {
            const firstOption = entry.valueType === 'options' ? entry.options?.[0] : undefined
            const initialArgs = firstOption !== undefined ? [firstOption] : []
            onChange(upsertDirectiveNode(children, entry.name, initialArgs, indent))
        } else {
            onChange(removeDirectiveNodes(children, entry.name))
        }
    }

    const setValue = (next: string) => {
        if (next.trim() === '') {
            onChange(removeDirectiveNodes(children, entry.name))
            return
        }
        onChange(upsertDirectiveNode(children, entry.name, tokenizeNginxArgs(next), indent))
    }

    if (entry.valueType === 'boolean') {
        return (
            <div className="flex items-center gap-2">
                <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
                <NginxHelpTooltip messageKey={helpKey}>
                    <Label className="font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                        {entry.name}
                    </Label>
                </NginxHelpTooltip>
            </div>
        )
    }

    if (entry.valueType === 'options' && entry.options) {
        return (
            <div className="flex items-center gap-2">
                <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
                <NginxHelpTooltip messageKey={helpKey}>
                    <Label className="font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                        {entry.name}
                    </Label>
                </NginxHelpTooltip>
                <Select value={checked ? value : ''} onValueChange={setValue}>
                    <SelectTrigger className="ml-auto h-8 w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">{t('nginxGui.disabled')}</SelectItem>
                        {entry.options.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
            <NginxHelpTooltip messageKey={helpKey}>
                <Label className="shrink-0 font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                    {entry.name}
                </Label>
            </NginxHelpTooltip>
            <Input
                className="h-8 font-mono text-xs"
                placeholder={placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                spellCheck={false}
            />
        </div>
    )
}
